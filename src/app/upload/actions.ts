"use server";

import { getCurrentUser } from "@/lib/auth";
import { decodeCsvBuffer } from "@/lib/csv/decode";
import { parseOrdersCsv } from "@/lib/csv/parseOrders";
import { parseProductsCsv } from "@/lib/csv/parseProducts";
import { importOrders, importProducts } from "@/lib/data/import";
import { createClient } from "@/lib/supabase/server";
import type { RowError } from "@/lib/types";
import type { UploadState } from "./state";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_ERRORS_SHOWN = 20;

const fail = (message: string, errors: RowError[] = []): UploadState => ({
  status: "error",
  message,
  errors: errors.slice(0, MAX_ERRORS_SHOWN),
});

/** 権限チェック(marketerのみ)とファイル検証。問題があればエラー状態を返す。 */
async function readCsvFile(
  formData: FormData,
): Promise<{ text: string; filename: string; userId: string } | UploadState> {
  const user = await getCurrentUser();
  if (!user) return fail("ログインが必要です。");
  if (!user.isMarketer) return fail("アップロードはマーケ担当のみ可能です。");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("CSVファイルを選択してください。");
  if (!file.name.toLowerCase().endsWith(".csv")) return fail("CSVファイル(.csv)を選択してください。");
  if (file.size > MAX_BYTES) return fail("ファイルが大きすぎます(上限10MB)。");

  return { text: decodeCsvBuffer(await file.arrayBuffer()), filename: file.name, userId: user.id };
}

const isState = (v: unknown): v is UploadState => typeof v === "object" && v !== null && "status" in v;

export async function uploadOrders(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const secret = process.env.CUSTOMER_KEY_SECRET;
  // 短い鍵だとメールのハッシュを総当たりで元に戻されるおそれがあるため、32文字以上を必須にする
  if (!secret || secret.length < 32) {
    return fail("サーバー設定エラー: CUSTOMER_KEY_SECRET が未設定、または短すぎます(32文字以上)。");
  }

  const file = await readCsvFile(formData);
  if (isState(file)) return file;

  const parsed = parseOrdersCsv(file.text, secret);
  if (parsed.fatal) return fail(parsed.fatal);
  if (parsed.rows.length === 0) {
    return fail("取り込める注文行がありませんでした。", parsed.errors);
  }

  const supabase = await createClient();
  const result = await importOrders(supabase, file.userId, file.filename, parsed.rows);
  if (!result.ok) {
    return fail(
      result.reason === "history"
        ? "アップロード履歴の保存に失敗しました。時間をおいて再度お試しください。"
        : "データの保存中にエラーが発生しました。一部だけ反映されている可能性があります。同じファイルをもう一度アップロードすると、残りが反映されます(二重計上はされません)。",
    );
  }
  return {
    status: "success",
    message:
      `${result.processed}件の注文明細を取り込み・更新しました(登録済みの注文は最新の内容で上書きされます)。` +
      (parsed.errors.length > 0 ? `形式エラーで除外した行: ${parsed.errors.length}件。` : ""),
    errors: parsed.errors.slice(0, MAX_ERRORS_SHOWN),
  };
}

export async function uploadProducts(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const file = await readCsvFile(formData);
  if (isState(file)) return file;

  const parsed = parseProductsCsv(file.text);
  if (parsed.fatal) return fail(parsed.fatal);
  if (parsed.products.length === 0) return fail("取り込める商品行がありませんでした。", parsed.errors);

  const supabase = await createClient();
  if (!(await importProducts(supabase, parsed.products))) {
    return fail("商品マスタの保存中にエラーが発生しました。時間をおいて再度お試しください。");
  }
  return {
    status: "success",
    message:
      `${parsed.products.length}件の商品を登録・更新しました。` +
      (parsed.errors.length > 0 ? `形式エラーで除外した行: ${parsed.errors.length}件。` : ""),
    errors: parsed.errors.slice(0, MAX_ERRORS_SHOWN),
  };
}

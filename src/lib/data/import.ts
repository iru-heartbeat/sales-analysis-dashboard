import type { SupabaseClient } from "@supabase/supabase-js";
import { toMonthKey } from "@/lib/kpi/month";
import type { OrderRow, Product } from "@/lib/types";

const INSERT_CHUNK = 500;

export type ImportOrdersResult =
  | { ok: true; processed: number }
  | { ok: false; reason: "history" | "save" };

/**
 * 注文を取り込む(アップロード履歴の作成 → 注文の保存)。
 *
 * 同じ「注文番号×SKU」が既にあれば内容を更新する(upsert)。
 * 後から返金・キャンセル・数量変更があった注文を、最新のCSVで上書きして反映するため。
 * 同じCSVを2回上げても結果は同じ(二重計上されない)。
 *
 * 途中で失敗しても、取り込み済みの分は消さない。
 * 取り込みは何度やり直しても同じ結果になるので、同じファイルを再アップロードすれば残りが反映される。
 * (アップロード履歴を消すと、履歴に紐づく注文までまとめて消えてしまい危険なため、巻き戻しはしない)
 */
export async function importOrders(
  supabase: SupabaseClient,
  userId: string,
  filename: string,
  rows: OrderRow[],
): Promise<ImportOrdersResult> {
  const periodMonth = rows.map((r) => toMonthKey(r.ordered_at)).sort()[0];

  const { data: upload, error: uploadError } = await supabase
    .from("uploads")
    .insert({ filename, period_month: `${periodMonth}-01`, uploaded_by: userId })
    .select("id")
    .single();
  if (uploadError || !upload) return { ok: false, reason: "history" };

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK).map((r) => ({ ...r, upload_id: upload.id }));
    const { error } = await supabase.from("orders").upsert(chunk, { onConflict: "order_id,sku" });
    if (error) return { ok: false, reason: "save" };
  }
  return { ok: true, processed: rows.length };
}

/** 商品マスタを登録・更新する(同じSKUは上書き)。失敗したら false。 */
export async function importProducts(supabase: SupabaseClient, products: Product[]): Promise<boolean> {
  for (let i = 0; i < products.length; i += INSERT_CHUNK) {
    const { error } = await supabase
      .from("products")
      .upsert(products.slice(i, i + INSERT_CHUNK), { onConflict: "sku" });
    if (error) return false;
  }
  return true;
}

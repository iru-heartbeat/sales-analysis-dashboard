"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { AI_MODEL, AiCommentError, generateComment } from "@/lib/ai/generateComment";
import { fetchDashboardData } from "@/lib/data/kpi";
import { isMonthKey } from "@/lib/kpi/month";
import { createClient } from "@/lib/supabase/server";
import type { AiState } from "./state";

// 月額予算(5,000円)を守るための上限: 全体で24時間に実行できる生成の回数。
// 失敗した試行もAPI料金がかかるので、成功・失敗に関わらず「試行」を数える。
const MAX_ATTEMPTS_PER_DAY = 5;

export async function generateAiComment(_prev: AiState, formData: FormData): Promise<AiState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "ログインが必要です。" };
  if (!user.isMarketer) return { status: "error", message: "AIコメントの生成はマーケ担当のみ可能です。" };

  const month = String(formData.get("month") ?? "");
  if (!isMonthKey(month)) return { status: "error", message: "対象月が不正です。" };

  const supabase = await createClient();

  // 先に試行を記録してから数える(同時に押されても、上限を超えた分は必ず弾かれる)
  const { error: logError } = await supabase
    .from("ai_generation_log")
    .insert({ month: `${month}-01`, user_id: user.id });
  if (logError) return { status: "error", message: "生成履歴の記録に失敗しました。" };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("ai_generation_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (countError) return { status: "error", message: "生成履歴の確認に失敗しました。" };
  if ((count ?? 0) > MAX_ATTEMPTS_PER_DAY) {
    return {
      status: "error",
      message: `AIコメントの生成は24時間に${MAX_ATTEMPTS_PER_DAY}回までです(費用の上限のため)。時間をおいてください。`,
    };
  }

  try {
    const data = await fetchDashboardData(supabase, month);
    if (!data.current.hasData) return { status: "error", message: "この月の売上データがありません。" };

    const comment = await generateComment(data);
    const { error } = await supabase.from("ai_comments").insert({
      month: `${month}-01`,
      summary: comment.summary,
      actions: comment.actions,
      model: AI_MODEL,
    });
    if (error) return { status: "error", message: "コメントの保存に失敗しました。" };
  } catch (e) {
    if (e instanceof AiCommentError) return { status: "error", message: e.message };
    return { status: "error", message: "AIコメントの生成中にエラーが発生しました。" };
  }

  revalidatePath("/");
  return { status: "success", message: "AIコメントを生成しました。" };
}

import { GenerateCommentButton } from "@/components/GenerateCommentButton";
import { formatMonthLabel } from "@/lib/kpi/month";
import { createClient } from "@/lib/supabase/server";

type Action = { title: string; detail: string };

export async function AiCommentPanel({ month, canGenerate }: { month: string; canGenerate: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_comments")
    .select("summary, actions, model, created_at")
    .eq("month", `${month}-01`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const actions = (data?.actions ?? []) as Action[];

  return (
    <section className="rounded-lg border border-border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-brand">AI分析コメント({formatMonthLabel(month)})</h2>
        {canGenerate && <GenerateCommentButton month={month} hasComment={!!data} />}
      </div>

      {!data ? (
        <p className="mt-4 text-sm text-foreground/60">
          まだコメントがありません。{canGenerate ? "「AIコメントを生成」を押してください。" : "マーケ担当が生成すると表示されます。"}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground/70">現状サマリー</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-7">{data.summary}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground/70">翌月のアクション提案</h3>
            <ol className="mt-2 space-y-3">
              {actions.map((a, i) => (
                <li key={i} className="rounded border border-border bg-muted p-3">
                  <p className="text-sm font-semibold text-brand">
                    {i + 1}. {a.title}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-7">{a.detail}</p>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-foreground/50">
            AIが生成した提案です。根拠として引用された数値は集計結果と照合済みですが、本文中の数値や提案内容は照合していません。実行前にご確認ください。
            生成日時: {new Date(data.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
          </p>
        </div>
      )}
    </section>
  );
}

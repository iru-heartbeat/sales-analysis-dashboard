import Link from "next/link";
import { Suspense } from "react";
import { AiCommentPanel } from "@/components/AiCommentPanel";
import { CategoryChart } from "@/components/charts/CategoryChart";
import { SkuChart } from "@/components/charts/SkuChart";
import { KpiCard } from "@/components/KpiCard";
import { getCurrentUser } from "@/lib/auth";
import { fetchAvailableMonths, fetchDashboardData } from "@/lib/data/kpi";
import { percent, signedPercent, signedPoints, yen } from "@/lib/format";
import { formatMonthLabel, isMonthKey } from "@/lib/kpi/month";
import { createClient } from "@/lib/supabase/server";

// このページから呼ぶServer Action(AIコメント生成など)の最大実行時間(秒)。
// 既定の10〜15秒だとAI生成の途中で打ち切られるため延ばす。
export const maxDuration = 60;

// searchParams と Cookie(ログイン状態)を読むため、Suspenseで囲んだ中で描画する
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<p className="text-sm">読み込み中...</p>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

const delta = (label: string, ratio: number | null, fmt: (n: number) => string) => ({
  label,
  text: ratio === null ? null : fmt(ratio),
  positive: ratio === null ? null : ratio >= 0,
});

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  const supabase = await createClient();
  const [months, user] = await Promise.all([fetchAvailableMonths(supabase), getCurrentUser()]);

  if (months.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-muted p-8">
        <h1 className="text-2xl font-semibold text-brand">売上分析ダッシュボード</h1>
        <p className="mt-2 text-sm">
          まだ売上データがありません。
          <Link href="/upload" className="font-medium text-brand underline">
            アップロード画面
          </Link>
          から商品マスタと注文CSVを取り込んでください。
        </p>
      </section>
    );
  }

  const requested = typeof params.month === "string" ? params.month : undefined;
  const month = isMonthKey(requested) && months.includes(requested) ? requested : months[months.length - 1];
  const data = await fetchDashboardData(supabase, month);
  const { current, changes } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-brand">{formatMonthLabel(month)}の売上分析</h1>
        <nav aria-label="月の切り替え" className="flex max-w-full gap-1 overflow-x-auto pb-1">
          {[...months].reverse().slice(0, 14).map((m) => (
            <Link
              key={m}
              href={`/?month=${m}`}
              aria-current={m === month ? "page" : undefined}
              className={`shrink-0 rounded px-3 py-1 text-sm ${
                m === month ? "bg-brand text-brand-foreground" : "border border-border bg-white hover:bg-muted"
              }`}
            >
              {formatMonthLabel(m)}
            </Link>
          ))}
        </nav>
      </div>

      {current.missingCostSkus.length > 0 && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          原価が未登録のSKUが{current.missingCostSkus.length}件あります(
          {current.missingCostSkus.slice(0, 5).join("、")}
          {current.missingCostSkus.length > 5 ? " ほか" : ""})。粗利はこれらを除いて計算しています。
          <Link href="/upload" className="ml-1 underline">
            商品マスタを更新
          </Link>
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="売上"
          value={yen(current.revenue)}
          sub={`注文 ${current.orderCount.toLocaleString("ja-JP")}件`}
          deltas={[
            delta("前月比", changes.revenueMom, signedPercent),
            delta("前年同月比", changes.revenueYoy, signedPercent),
          ]}
          note="数量×単価−割引の合計(返品・キャンセル除く)"
        />
        <KpiCard
          title="粗利"
          value={current.grossProfit === null ? "算出不可" : yen(current.grossProfit)}
          sub={current.grossMargin === null ? "原価が未登録です" : `粗利率 ${percent(current.grossMargin)}`}
          deltas={[
            delta("前月比", changes.grossProfitMom, signedPercent),
            delta("前年同月比", changes.grossProfitYoy, signedPercent),
          ]}
          note="売上−原価。商品マスタの原価が登録されたSKUのみ対象"
        />
        <KpiCard
          title="リピート率"
          value={current.repeatRate === null ? "算出不可" : percent(current.repeatRate)}
          sub={current.repeatRate === null ? "過去の購入履歴がありません" : undefined}
          deltas={[
            delta("前月差", changes.repeatRateMomPt, signedPoints),
            delta("前年同月差", changes.repeatRateYoyPt, signedPoints),
          ]}
          note="当月の購入者のうち、当月より前にも購入したことがある顧客の割合"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-brand">カテゴリ別売上</h2>
          <CategoryChart data={current.categories} />
        </section>
        <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-brand">SKU売上トップ10</h2>
          <SkuChart data={current.topSkus} />
        </section>
      </div>

      <AiCommentPanel month={month} canGenerate={!!user?.isMarketer} />
    </div>
  );
}

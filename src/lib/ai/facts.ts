import type { DashboardData } from "@/lib/data/kpi";
import { formatMonthLabel } from "@/lib/kpi/month";

/**
 * AIに渡す「事実」と、AIの出力を検証するロジック(純関数)。
 * AIは数字を取り違えることがあるため、
 *  1) AIには集計済みの数値だけを渡す(生データは渡さない)
 *  2) AIが「根拠として引用した数値」が、渡した数値と一致するかをコードで検証する
 * という二重の対策をとる。
 */

export const METRIC_KEYS = [
  "revenue",
  "gross_profit",
  "gross_margin_pct",
  "repeat_rate_pct",
  "revenue_mom_pct",
  "revenue_yoy_pct",
  "gross_profit_mom_pct",
  "repeat_rate_mom_pt",
  "order_count",
  "top_category_share_pct",
  "top_sku_revenue",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export type Facts = Record<MetricKey, number | null>;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildFacts(data: DashboardData): Facts {
  const { current, changes } = data;
  const pct = (r: number | null) => (r === null ? null : round1(r * 100));
  return {
    revenue: Math.round(current.revenue),
    gross_profit: current.grossProfit === null ? null : Math.round(current.grossProfit),
    gross_margin_pct: pct(current.grossMargin),
    repeat_rate_pct: pct(current.repeatRate),
    revenue_mom_pct: pct(changes.revenueMom),
    revenue_yoy_pct: pct(changes.revenueYoy),
    gross_profit_mom_pct: pct(changes.grossProfitMom),
    repeat_rate_mom_pt: pct(changes.repeatRateMomPt),
    order_count: current.orderCount,
    top_category_share_pct: current.categories[0] ? pct(current.categories[0].share) : null,
    top_sku_revenue: current.topSkus[0] ? Math.round(current.topSkus[0].revenue) : null,
  };
}

/**
 * CSV由来の文字列(商品名・カテゴリ)をプロンプトに入れる前に無害化する。
 * 改行を除いて短く切り、「指示のような長文」を紛れ込ませにくくする。
 */
export function sanitizeForPrompt(text: string): string {
  return text.replace(/[\r\n\t]+/g, " ").trim().slice(0, 60);
}

/** AIに渡す入力(プロンプトに埋め込むJSON) */
export function buildPromptInput(data: DashboardData, facts: Facts) {
  const { current } = data;
  return {
    対象月: formatMonthLabel(current.month),
    指標: facts,
    指標の単位: "revenue/gross_profit/top_sku_revenueは円、*_pctは%、repeat_rate_mom_ptは前月比のポイント差、order_countは注文数",
    カテゴリ別売上: current.categories.slice(0, 8).map((c) => ({
      カテゴリ: sanitizeForPrompt(c.category),
      売上: Math.round(c.revenue),
      構成比pct: round1(c.share * 100),
    })),
    SKU売上上位: current.topSkus.slice(0, 5).map((s) => ({
      SKU: sanitizeForPrompt(s.sku),
      商品名: sanitizeForPrompt(s.name),
      売上: Math.round(s.revenue),
      数量: s.qty,
    })),
    データの注意点: [
      ...(current.missingCostSkus.length > 0
        ? [`原価未登録のSKUが${current.missingCostSkus.length}件あり、粗利はそれらを除いて計算`]
        : []),
      ...(current.repeatRate === null ? ["リピート率は過去の購入履歴がないため算出不可"] : []),
      ...(data.previous.hasData ? [] : ["前月のデータがないため前月比は算出不可"]),
      ...(data.yearAgo.hasData ? [] : ["前年同月のデータがないため前年同月比は算出不可"]),
    ],
  };
}

export type Evidence = { metric: MetricKey; value: number };

/** 許容誤差: 円・件数は±1、%・ポイントは±0.1 */
function tolerance(metric: MetricKey): number {
  return metric.endsWith("_pct") || metric.endsWith("_pt") ? 0.1 : 1;
}

/**
 * AIが根拠として引用した数値が、渡した事実と一致するか検証する。
 * 不一致(または、算出不可の指標を引用)があれば、その説明の一覧を返す。空配列なら合格。
 */
export function validateEvidence(evidence: Evidence[], facts: Facts): string[] {
  const problems: string[] = [];
  for (const e of evidence) {
    const actual = facts[e.metric];
    if (actual === null) {
      problems.push(`${e.metric} は算出不可のため引用できません(引用値: ${e.value})`);
    } else if (Math.abs(actual - e.value) > tolerance(e.metric)) {
      problems.push(`${e.metric} の値が不一致です(正: ${actual} / 引用値: ${e.value})`);
    }
  }
  return problems;
}

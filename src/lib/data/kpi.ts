import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeMonth, changeRate, type MonthSummary } from "@/lib/kpi/calc";
import { addMonths, monthRange, monthsBetween, toMonthKey } from "@/lib/kpi/month";
import { fetchAllPages } from "@/lib/supabase/paging";
import type { Product } from "@/lib/types";

// DBから読み込んで月次サマリーを作る(サーバー専用)。集計の計算自体は lib/kpi/calc.ts の純関数。

const ORDER_COLUMNS =
  "order_id, sku, category, qty, unit_price, discount, is_cancelled, customer_key, line_cost";

export async function fetchProducts(supabase: SupabaseClient): Promise<Map<string, Product>> {
  const rows = await fetchAllPages<Product>((from, to) =>
    supabase.from("products").select("sku, name, category, cost").order("sku").range(from, to),
  );
  return new Map(rows.map((p) => [p.sku, { ...p, cost: Number(p.cost) }]));
}

/** データがある月の一覧(古い順)。データがなければ空配列。 */
export async function fetchAvailableMonths(supabase: SupabaseClient): Promise<string[]> {
  const [first, last] = await Promise.all([
    supabase.from("orders").select("ordered_at").order("ordered_at", { ascending: true }).limit(1),
    supabase.from("orders").select("ordered_at").order("ordered_at", { ascending: false }).limit(1),
  ]);
  if (first.error) throw new Error(first.error.message);
  if (last.error) throw new Error(last.error.message);
  if (!first.data?.length || !last.data?.length) return [];
  return monthsBetween(toMonthKey(first.data[0].ordered_at), toMonthKey(last.data[0].ordered_at));
}

type MonthLine = {
  order_id: string;
  sku: string;
  category: string | null;
  qty: number;
  unit_price: number;
  discount: number;
  is_cancelled: boolean;
  customer_key: string;
  line_cost: number | null;
};

async function fetchMonthLines(supabase: SupabaseClient, month: string): Promise<MonthLine[]> {
  const { start, end } = monthRange(month);
  const rows = await fetchAllPages<MonthLine>((from, to) =>
    supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .gte("ordered_at", start)
      .lt("ordered_at", end)
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({
    ...r,
    qty: Number(r.qty),
    unit_price: Number(r.unit_price),
    discount: Number(r.discount),
    // numeric列は文字列で返ってくるので数値に変換(null はそのまま)
    line_cost: r.line_cost === null ? null : Number(r.line_cost),
  }));
}

/** 当月の購入者のうち、当月より前にも購入している顧客のキー集合 */
async function fetchPriorCustomers(
  supabase: SupabaseClient,
  month: string,
  customerKeys: string[],
): Promise<Set<string>> {
  const { start } = monthRange(month);
  const prior = new Set<string>();
  const CHUNK = 100;
  for (let i = 0; i < customerKeys.length; i += CHUNK) {
    const chunk = customerKeys.slice(i, i + CHUNK);
    const rows = await fetchAllPages<{ customer_key: string }>((from, to) =>
      supabase
        .from("orders")
        .select("customer_key")
        .in("customer_key", chunk)
        .eq("is_cancelled", false) // 返金・キャンセルのみの顧客は「過去の購入者」に数えない
        .lt("ordered_at", start)
        .order("id")
        .range(from, to),
    );
    rows.forEach((r) => prior.add(r.customer_key));
  }
  return prior;
}

async function hasHistoryBefore(supabase: SupabaseClient, month: string): Promise<boolean> {
  const { start } = monthRange(month);
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("is_cancelled", false)
    .lt("ordered_at", start)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function fetchMonthSummary(
  supabase: SupabaseClient,
  month: string,
  products: Map<string, Product>,
): Promise<MonthSummary> {
  const lines = await fetchMonthLines(supabase, month);
  const customers = [...new Set(lines.filter((l) => !l.is_cancelled).map((l) => l.customer_key))];
  const [priorCustomers, hasHistory] = await Promise.all([
    fetchPriorCustomers(supabase, month, customers),
    hasHistoryBefore(supabase, month),
  ]);
  return summarizeMonth({ month, lines, products, priorCustomers, hasHistory });
}

export type DashboardData = {
  current: MonthSummary;
  previous: MonthSummary;
  yearAgo: MonthSummary;
  changes: {
    revenueMom: number | null;
    revenueYoy: number | null;
    grossProfitMom: number | null;
    grossProfitYoy: number | null;
    repeatRateMomPt: number | null; // 前月との差(ポイント)
    repeatRateYoyPt: number | null;
  };
};

const pointDiff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

/** 当月・前月・前年同月を取得して、前月比・前年同月比を付ける */
export async function fetchDashboardData(supabase: SupabaseClient, month: string): Promise<DashboardData> {
  const products = await fetchProducts(supabase);
  const [current, previous, yearAgo] = await Promise.all([
    fetchMonthSummary(supabase, month, products),
    fetchMonthSummary(supabase, addMonths(month, -1), products),
    fetchMonthSummary(supabase, addMonths(month, -12), products),
  ]);
  // 比較対象月にデータがなければ比較しない(0円との比較は誤解を招くため)
  const cmp = (base: MonthSummary, pick: (s: MonthSummary) => number | null) =>
    base.hasData ? changeRate(pick(current), pick(base)) : null;
  const pt = (base: MonthSummary) => (base.hasData ? pointDiff(current.repeatRate, base.repeatRate) : null);
  return {
    current,
    previous,
    yearAgo,
    changes: {
      revenueMom: cmp(previous, (s) => s.revenue),
      revenueYoy: cmp(yearAgo, (s) => s.revenue),
      grossProfitMom: cmp(previous, (s) => s.grossProfit),
      grossProfitYoy: cmp(yearAgo, (s) => s.grossProfit),
      repeatRateMomPt: pt(previous),
      repeatRateYoyPt: pt(yearAgo),
    },
  };
}

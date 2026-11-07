import type { OrderRow, Product } from "@/lib/types";

// 集計ロジック(純関数)。DBや画面に依存しないので、単体テストで検証できる。

export const UNCATEGORIZED = "未分類";

type OrderLine = Pick<
  OrderRow,
  "sku" | "category" | "qty" | "unit_price" | "discount" | "is_cancelled" | "customer_key"
>;

/** 返品・キャンセル行を除いた有効な行 */
function active<T extends { is_cancelled: boolean }>(lines: T[]): T[] {
  return lines.filter((l) => !l.is_cancelled);
}

/** 1行の売上 = 数量 × 単価 − 割引(マイナスにはしない) */
export function lineRevenue(l: Pick<OrderLine, "qty" | "unit_price" | "discount">): number {
  return Math.max(0, l.qty * l.unit_price - l.discount);
}

export function revenue(lines: OrderLine[]): number {
  return active(lines).reduce((sum, l) => sum + lineRevenue(l), 0);
}

export type GrossProfitResult = {
  /** 原価が登録済みのSKUだけで計算した粗利 */
  grossProfit: number;
  /** 粗利の計算対象にした売上(原価登録済みSKUの売上) */
  coveredRevenue: number;
  /** 原価が未登録のSKU */
  missingCostSkus: string[];
};

/**
 * 粗利 = 売上 − 原価(数量 × 原価)。
 * 原価未登録のSKUは粗利の計算から除外し、missingCostSkus で警告できるようにする
 * (原価0円として扱うと粗利を過大に見せてしまうため)。
 */
export function grossProfit(lines: OrderLine[], products: Map<string, Product>): GrossProfitResult {
  let profit = 0;
  let covered = 0;
  const missing = new Set<string>();
  for (const l of active(lines)) {
    const product = products.get(l.sku);
    if (!product) {
      missing.add(l.sku);
      continue;
    }
    const rev = lineRevenue(l);
    covered += rev;
    profit += rev - l.qty * product.cost;
  }
  return { grossProfit: profit, coveredRevenue: covered, missingCostSkus: [...missing].sort() };
}

/**
 * リピート率 = 当月の購入者のうち、当月より前に購入履歴がある人の割合。
 * 購入履歴が全くない(データ開始月)ときは判定できないので null。
 */
export function repeatRate(
  monthLines: OrderLine[],
  priorCustomers: Set<string>,
  hasHistory: boolean,
): number | null {
  if (!hasHistory) return null;
  const customers = new Set(active(monthLines).map((l) => l.customer_key));
  if (customers.size === 0) return null;
  let repeat = 0;
  for (const c of customers) if (priorCustomers.has(c)) repeat++;
  return repeat / customers.size;
}

function categoryOf(l: OrderLine, products: Map<string, Product>): string {
  return products.get(l.sku)?.category || l.category || UNCATEGORIZED;
}

export type CategorySales = { category: string; revenue: number; share: number };

/** カテゴリ別売上(売上の多い順)。カテゴリは商品マスタを優先する。 */
export function salesByCategory(lines: OrderLine[], products: Map<string, Product>): CategorySales[] {
  const totals = new Map<string, number>();
  for (const l of active(lines)) {
    const c = categoryOf(l, products);
    totals.set(c, (totals.get(c) ?? 0) + lineRevenue(l));
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([category, rev]) => ({ category, revenue: rev, share: sum > 0 ? rev / sum : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

export type SkuSales = { sku: string; name: string; revenue: number; qty: number };

/** SKU別売上の上位N件 */
export function topSkus(lines: OrderLine[], products: Map<string, Product>, n = 10): SkuSales[] {
  const totals = new Map<string, { revenue: number; qty: number }>();
  for (const l of active(lines)) {
    const t = totals.get(l.sku) ?? { revenue: 0, qty: 0 };
    t.revenue += lineRevenue(l);
    t.qty += l.qty;
    totals.set(l.sku, t);
  }
  return [...totals.entries()]
    .map(([sku, t]) => ({ sku, name: products.get(sku)?.name || sku, ...t }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, n);
}

/** 比率の変化率(前期比など)。比較元が0/なしなら null。 */
export function changeRate(current: number | null, base: number | null): number | null {
  if (current === null || base === null || base === 0) return null;
  return (current - base) / Math.abs(base);
}

export type MonthSummary = {
  month: string;
  hasData: boolean;
  orderCount: number;
  revenue: number;
  grossProfit: number | null; // 原価登録済みSKUが1つもなければ null
  grossMargin: number | null; // 粗利 ÷ 粗利計算対象の売上
  costCoverage: number | null; // 売上のうち原価登録済みSKUの割合
  missingCostSkus: string[];
  repeatRate: number | null;
  categories: CategorySales[];
  topSkus: SkuSales[];
};

export function summarizeMonth(input: {
  month: string;
  lines: (OrderLine & { order_id: string })[];
  products: Map<string, Product>;
  priorCustomers: Set<string>;
  hasHistory: boolean;
}): MonthSummary {
  const { month, lines, products, priorCustomers, hasHistory } = input;
  const rev = revenue(lines);
  const gp = grossProfit(lines, products);
  const hasCost = gp.coveredRevenue > 0;
  return {
    month,
    hasData: active(lines).length > 0,
    orderCount: new Set(active(lines).map((l) => l.order_id)).size,
    revenue: rev,
    grossProfit: hasCost ? gp.grossProfit : null,
    grossMargin: hasCost ? gp.grossProfit / gp.coveredRevenue : null,
    costCoverage: rev > 0 ? gp.coveredRevenue / rev : null,
    missingCostSkus: gp.missingCostSkus,
    repeatRate: repeatRate(lines, priorCustomers, hasHistory),
    categories: salesByCategory(lines, products),
    topSkus: topSkus(lines, products, 10),
  };
}

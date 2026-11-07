import Papa from "papaparse";
import type { OrderRow, Product, RowError } from "@/lib/types";
import { LUMINA_COLUMNS, resolveColumns } from "./columns";
import { toCustomerKey } from "./customerKey";
import { parseOrderedAt } from "./parseOrders";
import { clip, MAX_MONEY, parseNonNegative, parseQty } from "./values";

export type ParseLuminaResult = {
  rows: OrderRow[];
  /** CSVの商品名・カテゴリ・原価から作った商品マスタ(SKU別) */
  products: Product[];
  errors: RowError[];
  totalLines: number;
  fatal: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** この形式のCSVか(ヘッダーに order_date と customer_id がある) */
export function isLuminaHeader(headers: string[]): boolean {
  const col = resolveColumns(headers, LUMINA_COLUMNS);
  return !!col.orderDate && !!col.customerId && !!col.revenue;
}

/**
 * 案件8の公式サンプル形式(order_date, customer_id, product_name, category, sku, quantity, revenue, cost)をパースする。
 *
 * - 注文番号がないので、「日付|顧客ID|SKU」を注文番号の代わりにする。
 *   同じ日に同じ顧客が同じSKUを複数行買っていたら、数量・金額を合算する。
 * - revenue / cost は行の合計金額。単価は revenue ÷ quantity で求める。
 * - 原価は行ごとに持つ(line_cost)。商品マスタ用に、SKUごとの単価原価も作る。
 * - customer_id は匿名のIDだが、メールと同じくハッシュ化して保存する。
 */
export function parseLuminaCsv(text: string, secret: string): ParseLuminaResult {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy" });
  if (parsed.errors.some((e) => e.type === "Quotes")) {
    return {
      rows: [],
      products: [],
      errors: [],
      totalLines: 0,
      fatal: "CSVの引用符(\")が閉じていません。ファイルが壊れている可能性があります。",
    };
  }
  const col = resolveColumns(parsed.meta.fields ?? [], LUMINA_COLUMNS);
  const missing = (
    [
      ["orderDate", "order_date"],
      ["customerId", "customer_id"],
      ["sku", "sku"],
      ["quantity", "quantity"],
      ["revenue", "revenue"],
    ] as const
  )
    .filter(([key]) => !col[key])
    .map(([, label]) => label);
  if (missing.length > 0) {
    return {
      rows: [],
      products: [],
      errors: [],
      totalLines: parsed.data.length,
      fatal: `必須の列が見つかりません: ${missing.join("、")}`,
    };
  }

  const errors: RowError[] = [];
  // 合算用: 「日付|顧客|SKU」ごとに数量・売上・原価の合計を持つ
  const merged = new Map<
    string,
    { orderId: string; orderedAt: string; customerId: string; sku: string; category: string | null; qty: number; revenue: number; cost: number | null }
  >();
  const products = new Map<string, Product>();

  parsed.data.forEach((raw, i) => {
    const line = i + 2;
    const get = (key: keyof typeof LUMINA_COLUMNS) => {
      const name = col[key];
      return name ? clip(raw[name] ?? "") : "";
    };

    const date = get("orderDate");
    const orderedAt = parseOrderedAt(date);
    if (!orderedAt) {
      errors.push({ line, message: date ? `日付の形式が不正です: ${date}` : "日付がありません" });
      return;
    }
    const customerId = get("customerId");
    if (!customerId) {
      errors.push({ line, message: "顧客IDがありません" });
      return;
    }
    const sku = get("sku");
    if (!sku) {
      errors.push({ line, message: "SKUがありません" });
      return;
    }
    const qty = parseQty(get("quantity"));
    if (qty === null || qty < 1) {
      errors.push({ line, message: `数量が不正です: ${get("quantity")}` });
      return;
    }
    const revenue = parseNonNegative(get("revenue"), MAX_MONEY);
    if (revenue === null) {
      errors.push({ line, message: `売上(revenue)が不正です: ${get("revenue")}` });
      return;
    }
    const costRaw = col.cost ? get("cost") : "";
    const cost = costRaw === "" ? null : parseNonNegative(costRaw, MAX_MONEY);
    if (costRaw !== "" && cost === null) {
      errors.push({ line, message: `原価(cost)が不正です: ${costRaw}` });
      return;
    }

    const category = get("category") || null;
    const orderId = `${date}|${customerId}|${sku}`;
    const existing = merged.get(orderId);
    if (existing) {
      existing.qty += qty;
      existing.revenue += revenue;
      existing.cost = existing.cost === null || cost === null ? (existing.cost ?? cost) : existing.cost + cost;
    } else {
      merged.set(orderId, { orderId, orderedAt, customerId, sku, category, qty, revenue, cost });
    }

    if (cost !== null) {
      products.set(sku, { sku, name: get("productName") || null, category, cost: round2(cost / qty) });
    }
  });

  const rows: OrderRow[] = [...merged.values()].map((m) => ({
    order_id: m.orderId,
    ordered_at: m.orderedAt,
    customer_key: toCustomerKey(m.customerId, m.orderId, secret),
    sku: m.sku,
    category: m.category,
    qty: m.qty,
    unit_price: round2(m.revenue / m.qty),
    discount: 0,
    is_cancelled: false,
    line_cost: m.cost,
  }));

  return { rows, products: [...products.values()], errors, totalLines: parsed.data.length, fatal: null };
}

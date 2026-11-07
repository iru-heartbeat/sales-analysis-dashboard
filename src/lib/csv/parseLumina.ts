import Papa from "papaparse";
import type { OrderRow, Product, RowError } from "@/lib/types";
import { LUMINA_COLUMNS, resolveColumns } from "./columns";
import { toCustomerKey } from "./customerKey";
import { parseOrderedAt } from "./parseOrders";
import { clip, MAX_MONEY, parseNonNegative, parseQty } from "./values";

export type ParseLuminaResult = {
  rows: OrderRow[];
  /** CSVの商品名・カテゴリ・原価から作った商品マスタの候補(SKU別)。原価が揃っているSKUのみ */
  products: Product[];
  errors: RowError[];
  totalLines: number;
  fatal: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** この形式のCSVか(ヘッダーに order_date と customer_id と revenue がある) */
export function isLuminaHeader(headers: string[]): boolean {
  const col = resolveColumns(headers, LUMINA_COLUMNS);
  return !!col.orderDate && !!col.customerId && !!col.revenue;
}

type Merged = {
  orderId: string;
  orderedAt: string;
  customerId: string;
  sku: string;
  category: string | null;
  qty: number;
  revenue: number;
  /** 合算した原価。1行でも原価が空欄なら null(一部だけの原価で粗利を過大に見せないため) */
  cost: number | null;
};

type ProductAcc = { name: string | null; category: string | null; qty: number; cost: number; complete: boolean };

/**
 * 案件8の公式サンプル形式(order_date, customer_id, product_name, category, sku, quantity, revenue, cost)をパースする。
 *
 * - 注文番号がないので、「日付|顧客ID」を注文番号の代わりにする(同じ日の同じ顧客の買い物=1注文)。
 *   日付は読み取った値を整えて使うので、"2025-09-03" と "2025-09-03 00:00:00" は同じ注文になる。
 *   同じ注文で同じSKUが複数行あれば、数量・売上・原価を合算する。
 * - revenue / cost は行の合計金額。そのまま line_revenue / line_cost に保存する
 *   (単価は表示用に revenue ÷ quantity で求めるが、売上の計算には使わない)。
 * - 商品マスタ用に、SKUごとの単価原価(原価合計 ÷ 数量合計)も作る。
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
  const merged = new Map<string, Merged>();
  const productAcc = new Map<string, ProductAcc>();

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
    // 注文IDは、読み取って整えた日付(YYYY-MM-DD)から作る(書き方の違いで別注文にならないように)
    const orderId = `${orderedAt.slice(0, 10)}|${customerId}`;
    const key = `${orderId}|${sku}`;
    const existing = merged.get(key);
    if (existing) {
      existing.qty += qty;
      existing.revenue += revenue;
      existing.cost = existing.cost === null || cost === null ? null : existing.cost + cost;
    } else {
      merged.set(key, { orderId, orderedAt, customerId, sku, category, qty, revenue, cost });
    }

    const acc = productAcc.get(sku) ?? { name: null, category: null, qty: 0, cost: 0, complete: true };
    acc.name = acc.name ?? (get("productName") || null);
    acc.category = acc.category ?? category;
    acc.qty += qty;
    if (cost === null) acc.complete = false;
    else acc.cost += cost;
    productAcc.set(sku, acc);
  });

  const rows: OrderRow[] = [...merged.values()].map((m) => ({
    order_id: m.orderId,
    ordered_at: m.orderedAt,
    customer_key: toCustomerKey(m.customerId, m.orderId, secret),
    sku: m.sku,
    category: m.category,
    qty: m.qty,
    unit_price: round2(m.revenue / m.qty), // 表示用。売上の計算は line_revenue を使う
    discount: 0,
    is_cancelled: false,
    line_cost: m.cost === null ? null : round2(m.cost),
    line_revenue: round2(m.revenue),
  }));

  // 商品マスタの候補: 原価が全行そろっているSKUだけ。単価原価 = 原価合計 ÷ 数量合計
  const products: Product[] = [...productAcc.entries()]
    .filter(([, a]) => a.complete && a.qty > 0)
    .map(([sku, a]) => ({ sku, name: a.name, category: a.category, cost: round2(a.cost / a.qty) }));

  return { rows, products, errors, totalLines: parsed.data.length, fatal: null };
}

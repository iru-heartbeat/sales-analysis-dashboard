import Papa from "papaparse";
import type { OrderRow, RowError } from "@/lib/types";
import { CANCELLED_STATUSES, ORDER_COLUMNS, resolveColumns } from "./columns";
import { toCustomerKey } from "./customerKey";
import { clip, MAX_MONEY, parseNonNegative, parseQty } from "./values";

export type ParseOrdersResult = {
  rows: OrderRow[];
  errors: RowError[];
  totalLines: number;
  fatal: string | null; // 続行不能なエラー(必須列がない等)
};

/** "2026-01-05 12:34:56 +0900" / ISO形式 / タイムゾーンなし(日本時間とみなす) に対応 */
export function parseOrderedAt(value: string): string | null {
  const m = value
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/,
    );
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", tzRaw] = m;
  let tz = "+09:00";
  if (tzRaw) {
    tz = tzRaw === "Z" ? "Z" : tzRaw.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  }
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${tz}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}


/**
 * Shopify注文CSV(1商品=1行)をパースする。
 * 注文単位の情報(メール・日時・ステータス)は注文の最初の行にしか入らないため、
 * 同じ注文番号の後続行には先頭行の値を引き継ぐ。
 * 同じ注文内で同じSKUが複数行あるときは数量・割引を合算する(DBの一意制約に合わせるため)。
 */
export function parseOrdersCsv(text: string, secret: string): ParseOrdersResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
  });
  // 引用符が閉じていないと、ファイルの残りが1つの欄に飲み込まれて注文が消えるため、取り込まない
  if (parsed.errors.some((e) => e.type === "Quotes")) {
    return {
      rows: [],
      errors: [],
      totalLines: 0,
      fatal: "CSVの引用符(\")が閉じていません。ファイルが壊れている可能性があります。",
    };
  }
  const headers = parsed.meta.fields ?? [];
  const col = resolveColumns(headers, ORDER_COLUMNS);

  const missing = (
    [
      ["orderId", "注文番号(Name)"],
      ["orderedAt", "注文日時(Created at)"],
      ["qty", "数量(Lineitem quantity)"],
      ["unitPrice", "単価(Lineitem price)"],
      ["sku", "SKU(Lineitem sku)"],
    ] as const
  )
    .filter(([key]) => !col[key])
    .map(([, label]) => label);

  if (missing.length > 0) {
    return {
      rows: [],
      errors: [],
      totalLines: parsed.data.length,
      fatal: `必須の列が見つかりません: ${missing.join("、")}`,
    };
  }

  const errors: RowError[] = [];
  const merged = new Map<string, OrderRow>();
  // 注文ごとに、先頭行の値を保持
  const orderContext = new Map<
    string,
    { email: string; orderedAt: string; cancelled: boolean }
  >();

  parsed.data.forEach((raw, i) => {
    const line = i + 2; // ヘッダーが1行目
    const get = (key: keyof typeof ORDER_COLUMNS) => {
      const name = col[key];
      return name ? clip(raw[name] ?? "") : "";
    };

    const orderId = get("orderId");
    if (!orderId) {
      errors.push({ line, message: "注文番号がありません" });
      return;
    }

    let ctx = orderContext.get(orderId);
    const rawDate = get("orderedAt");
    if (!ctx) {
      if (!rawDate) {
        errors.push({ line, message: "注文日時がありません" });
        return;
      }
      const orderedAt = parseOrderedAt(rawDate);
      if (!orderedAt) {
        errors.push({ line, message: `注文日時の形式が不正です: ${rawDate}` });
        return;
      }
      const status = get("financialStatus").toLowerCase();
      ctx = {
        email: get("email"),
        orderedAt,
        cancelled:
          CANCELLED_STATUSES.includes(status) || get("cancelledAt") !== "",
      };
      orderContext.set(orderId, ctx);
    }

    const sku = get("sku");
    if (!sku) {
      // 送料などSKUのない行は商品ではないので無視する(エラーにはしない)
      if (!get("itemName")) return;
      errors.push({ line, message: "SKUがありません" });
      return;
    }

    const qty = parseQty(get("qty"));
    if (qty === null) {
      errors.push({ line, message: `数量が不正です: ${get("qty")}` });
      return;
    }
    const unitPrice = parseNonNegative(get("unitPrice"), MAX_MONEY);
    if (unitPrice === null) {
      errors.push({ line, message: `単価が不正です: ${get("unitPrice")}` });
      return;
    }
    const discountRaw = get("discount");
    const discount = discountRaw === "" ? 0 : parseNonNegative(discountRaw, MAX_MONEY);
    if (discount === null) {
      errors.push({ line, message: `割引額が不正です: ${discountRaw}` });
      return;
    }

    const key = `${orderId}\u0000${sku}`;
    const existing = merged.get(key);
    if (existing) {
      existing.qty += qty;
      existing.discount += discount;
      return;
    }
    merged.set(key, {
      order_id: orderId,
      ordered_at: ctx.orderedAt,
      customer_key: toCustomerKey(ctx.email, orderId, secret),
      sku,
      category: get("category") || null,
      qty,
      unit_price: unitPrice,
      discount,
      is_cancelled: ctx.cancelled,
      line_cost: null,
      line_revenue: null,
    });
  });

  return {
    rows: [...merged.values()],
    errors,
    totalLines: parsed.data.length,
    fatal: null,
  };
}

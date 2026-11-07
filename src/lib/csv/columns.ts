/**
 * CSVの列名マッピング設定。
 * CSVの形式が違う場合は、ここに別名を足すだけで対応できる(パーサー本体は変更不要)。
 * 比較は「前後の空白を除き、小文字化」して行う。
 */
export const ORDER_COLUMNS = {
  orderId: ["name", "order id", "order", "注文番号", "注文id"],
  email: ["email", "customer email", "メールアドレス", "メール"],
  orderedAt: ["created at", "ordered at", "date", "注文日時", "注文日"],
  qty: ["lineitem quantity", "quantity", "数量"],
  unitPrice: ["lineitem price", "price", "単価"],
  sku: ["lineitem sku", "sku", "商品コード"],
  itemName: ["lineitem name", "product name", "商品名"],
  discount: ["discount amount", "discount", "割引額", "割引"],
  financialStatus: ["financial status", "支払いステータス"],
  cancelledAt: ["cancelled at", "キャンセル日時"],
  category: ["category", "product type", "カテゴリ"],
} as const;

/**
 * 案件8の公式サンプル(LUMINA)形式: 注文番号がなく、1行=1売上明細。
 * revenue / cost は「その行の合計金額」(単価ではない)。
 */
export const LUMINA_COLUMNS = {
  orderDate: ["order_date"],
  customerId: ["customer_id"],
  productName: ["product_name"],
  category: ["category"],
  sku: ["sku"],
  quantity: ["quantity"],
  revenue: ["revenue"],
  cost: ["cost"],
} as const;

export const PRODUCT_COLUMNS = {
  sku: ["sku", "商品コード"],
  name: ["name", "product name", "商品名"],
  category: ["category", "product type", "カテゴリ"],
  cost: ["cost", "原価"],
} as const;

/** 返品・無効とみなす支払いステータス */
export const CANCELLED_STATUSES = ["refunded", "voided"];

/** ヘッダー行から「項目名 → 実際の列名」を引く */
export function resolveColumns<K extends string>(
  headers: string[],
  spec: Record<K, readonly string[]>,
): Record<K, string | undefined> {
  const normalized = new Map(
    headers.map((h) => [h.trim().toLowerCase(), h] as const),
  );
  const result = {} as Record<K, string | undefined>;
  for (const key of Object.keys(spec) as K[]) {
    result[key] = spec[key]
      .map((alias) => normalized.get(alias))
      .find((v) => v !== undefined);
  }
  return result;
}

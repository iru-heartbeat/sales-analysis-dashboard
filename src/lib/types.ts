// アプリ全体で共通のデータ型

/** DBの orders テーブル1行に相当(取り込み時の形) */
export type OrderRow = {
  order_id: string;
  ordered_at: string; // ISO 8601 (タイムゾーン付き)
  customer_key: string; // メールのHMACハッシュ
  sku: string;
  category: string | null;
  qty: number;
  unit_price: number;
  discount: number;
  is_cancelled: boolean;
  /** 行ごとの原価(合計)。CSVに入っている形式のみ。null なら商品マスタの原価で計算する */
  line_cost: number | null;
};

/** DBの products テーブル1行 */
export type Product = {
  sku: string;
  name: string | null;
  category: string | null;
  cost: number;
};

/** CSVの1行ごとの検証エラー */
export type RowError = {
  line: number; // CSV上の行番号(ヘッダーを1行目とする)
  message: string;
};

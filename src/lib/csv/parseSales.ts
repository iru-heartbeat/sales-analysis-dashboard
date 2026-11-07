import Papa from "papaparse";
import type { OrderRow, Product, RowError } from "@/lib/types";
import { isLuminaHeader, parseLuminaCsv } from "./parseLumina";
import { parseOrdersCsv } from "./parseOrders";

export type ParseSalesResult = {
  /** 検出したCSVの形式 */
  format: "shopify" | "lumina";
  rows: OrderRow[];
  /** CSV自体に商品情報(名前・原価)が含まれる形式のとき、そこから作った商品マスタ */
  products: Product[];
  errors: RowError[];
  totalLines: number;
  fatal: string | null;
};

/** ヘッダー行を見て、CSVの形式(Shopify注文CSV / 案件8のLUMINA形式)を自動判定してパースする */
export function parseSalesCsv(text: string, secret: string): ParseSalesResult {
  const headers = Papa.parse<string[]>(text, { preview: 1 }).data[0] ?? [];
  if (isLuminaHeader(headers)) {
    return { format: "lumina", ...parseLuminaCsv(text, secret) };
  }
  return { format: "shopify", products: [], ...parseOrdersCsv(text, secret) };
}

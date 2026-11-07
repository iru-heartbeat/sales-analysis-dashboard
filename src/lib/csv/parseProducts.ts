import Papa from "papaparse";
import type { Product, RowError } from "@/lib/types";
import { PRODUCT_COLUMNS, resolveColumns } from "./columns";
import { clip, MAX_MONEY, parseNonNegative } from "./values";

export type ParseProductsResult = {
  products: Product[];
  errors: RowError[];
  fatal: string | null;
};

/** 商品マスタCSV(SKU・商品名・カテゴリ・原価)をパースする。同じSKUが複数行なら後の行が優先。 */
export function parseProductsCsv(text: string): ParseProductsResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.some((e) => e.type === "Quotes")) {
    return {
      products: [],
      errors: [],
      fatal: "CSVの引用符(\")が閉じていません。ファイルが壊れている可能性があります。",
    };
  }
  const col = resolveColumns(parsed.meta.fields ?? [], PRODUCT_COLUMNS);

  const missing = (
    [
      ["sku", "SKU"],
      ["cost", "原価(cost)"],
    ] as const
  )
    .filter(([key]) => !col[key])
    .map(([, label]) => label);
  if (missing.length > 0) {
    return {
      products: [],
      errors: [],
      fatal: `必須の列が見つかりません: ${missing.join("、")}`,
    };
  }

  const errors: RowError[] = [];
  const bySku = new Map<string, Product>();

  parsed.data.forEach((raw, i) => {
    const line = i + 2;
    const sku = clip(raw[col.sku!] ?? "");
    if (!sku) {
      errors.push({ line, message: "SKUがありません" });
      return;
    }
    const cost = parseNonNegative(raw[col.cost!], MAX_MONEY);
    if (cost === null) {
      errors.push({ line, message: `原価が不正です: ${raw[col.cost!] ?? ""}` });
      return;
    }
    bySku.set(sku, {
      sku,
      name: col.name ? clip(raw[col.name] ?? "") || null : null,
      category: col.category ? clip(raw[col.category] ?? "") || null : null,
      cost,
    });
  });

  return { products: [...bySku.values()], errors, fatal: null };
}

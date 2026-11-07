import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { salesByCategory, summarizeMonth } from "@/lib/kpi/calc";
import { addMonths, toMonthKey } from "@/lib/kpi/month";
import type { OrderRow, Product } from "@/lib/types";
import { parseLuminaCsv } from "./parseLumina";
import { parseSalesCsv } from "./parseSales";

const SECRET = "test-secret-test-secret-test-secret-123";
// 案件8の公式サンプルCSV(説明書 docs/sample-data.md の「正解値」と照合する)
const csv = readFileSync("tests/fixtures/sample-sales.csv", "utf8");

const withOrderId = (rows: OrderRow[]) => rows;

/** 指定月のサマリーを、DBを使わずメモリ上で作る(lib/data/kpi.ts と同じ手順) */
function summarize(rows: OrderRow[], products: Product[], month: string) {
  const lines = rows.filter((r) => toMonthKey(r.ordered_at) === month);
  const before = rows.filter((r) => toMonthKey(r.ordered_at) < month);
  return summarizeMonth({
    month,
    lines: withOrderId(lines),
    products: new Map(products.map((p) => [p.sku, p])),
    priorCustomers: new Set(before.map((r) => r.customer_key)),
    hasHistory: before.length > 0,
  });
}

describe("parseLuminaCsv(案件8の公式サンプル)", () => {
  const parsed = parseLuminaCsv(csv, SECRET);

  it("40行すべて取り込め、エラーがない", () => {
    expect(parsed.fatal).toBeNull();
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(40);
  });

  it("形式を自動判定する(LUMINA形式 / Shopify形式)", () => {
    expect(parseSalesCsv(csv, SECRET).format).toBe("lumina");
    const shopify = "Name,Email,Created at,Lineitem quantity,Lineitem price,Lineitem sku\n#1,a@x.com,2026-01-05 10:00:00 +0900,1,1000,A";
    expect(parseSalesCsv(shopify, SECRET).format).toBe("shopify");
  });

  it("月次の売上・粗利が説明書の正解値と完全に一致する", () => {
    const expected = {
      "2025-09": { revenue: 148_400, grossProfit: 93_400 },
      "2025-10": { revenue: 147_500, grossProfit: 92_600 },
      "2025-11": { revenue: 264_700, grossProfit: 163_100 },
    };
    for (const [month, want] of Object.entries(expected)) {
      const s = summarize(parsed.rows, parsed.products, month);
      expect(s.revenue, `${month} 売上`).toBe(want.revenue);
      expect(s.grossProfit, `${month} 粗利`).toBe(want.grossProfit);
      expect(s.missingCostSkus).toEqual([]);
    }
    const total = Object.keys(expected).reduce((sum, m) => sum + summarize(parsed.rows, parsed.products, m).revenue, 0);
    expect(total).toBe(560_600);
  });

  it("カテゴリ別売上が説明書の正解値と一致する", () => {
    const products = new Map(parsed.products.map((p) => [p.sku, p]));
    const byCategory = Object.fromEntries(
      salesByCategory(parsed.rows, products).map((c) => [c.category, c.revenue]),
    );
    expect(byCategory).toEqual({
      アウター: 287_400,
      トップス: 114_400,
      ボトムス: 82_200,
      アクセサリー: 76_600,
    });
  });

  it("説明書の全期間リピート率(28人中8人=28.6%)と同じ顧客構成になっている", () => {
    const monthsByCustomer = new Map<string, Set<string>>();
    for (const r of parsed.rows) {
      const set = monthsByCustomer.get(r.customer_key) ?? new Set<string>();
      set.add(toMonthKey(r.ordered_at));
      monthsByCustomer.set(r.customer_key, set);
    }
    const repeaters = [...monthsByCustomer.values()].filter((m) => m.size >= 2).length;
    expect(monthsByCustomer.size).toBe(28);
    expect(repeaters).toBe(8);
    expect(repeaters / monthsByCustomer.size).toBeCloseTo(0.286, 3);
  });

  it("月次リピート率(当月の購入者のうち過去にも購入した人の割合)を計算できる", () => {
    // 9月: 過去の履歴が全くないので算出不可 / 10月: 13人中5人 / 11月: 15人中7人
    expect(summarize(parsed.rows, parsed.products, "2025-09").repeatRate).toBeNull();
    expect(summarize(parsed.rows, parsed.products, "2025-10").repeatRate).toBeCloseTo(5 / 13);
    expect(summarize(parsed.rows, parsed.products, "2025-11").repeatRate).toBeCloseTo(7 / 15);
  });

  it("11月の売上は10月の約1.8倍(説明書の読みどころ)", () => {
    const oct = summarize(parsed.rows, parsed.products, "2025-10").revenue;
    const nov = summarize(parsed.rows, parsed.products, "2025-11").revenue;
    expect(nov / oct).toBeCloseTo(1.79, 2);
    expect(addMonths("2025-10", 1)).toBe("2025-11");
  });

  it("商品マスタをCSVから作る(商品名・カテゴリ・単価原価)", () => {
    const tshirt = parsed.products.find((p) => p.sku === "LUM-TOP-01");
    expect(tshirt).toEqual({ sku: "LUM-TOP-01", name: "オーガニックコットンTシャツ", category: "トップス", cost: 1400 });
    expect(parsed.products).toHaveLength(8);
  });

  it("顧客IDはハッシュ化され、元のIDは残らない", () => {
    expect(parsed.rows[0].customer_key).not.toContain("C001");
    // 同じ顧客は同じキー
    const c001 = parsed.rows.filter((r) => r.customer_key === parsed.rows[0].customer_key);
    expect(c001.length).toBe(3);
  });

  it("不正な行はエラーにし、他は取り込む。必須列がなければ fatal", () => {
    const bad = [
      "order_date,customer_id,product_name,category,sku,quantity,revenue,cost",
      "2025-09-03,C001,A,トップス,S1,2,7600,2800",
      "日付ではない,C002,A,トップス,S1,1,100,50",
      "2025-09-04,,A,トップス,S1,1,100,50",
      "2025-09-05,C003,A,トップス,S1,0,100,50",
      "2025-09-06,C004,A,トップス,S1,1,1e3,50",
    ].join("\n");
    const r = parseLuminaCsv(bad, SECRET);
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
    expect(parseLuminaCsv("order_date,customer_id\n2025-01-01,C1", SECRET).fatal).toContain("必須の列");
  });

  it("同じ日に同じ顧客が同じSKUを複数行買った場合は合算する", () => {
    const dup = [
      "order_date,customer_id,product_name,category,sku,quantity,revenue,cost",
      "2025-09-03,C001,A,トップス,S1,1,3800,1400",
      "2025-09-03,C001,A,トップス,S1,2,7600,2800",
    ].join("\n");
    const r = parseLuminaCsv(dup, SECRET);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ qty: 3, unit_price: 3800, line_cost: 4200, line_revenue: 11400 });
  });

  const HEADER = "order_date,customer_id,product_name,category,sku,quantity,revenue,cost";

  it("割り切れない金額でも、売上はCSVの金額と一致する(100円÷3個=99.99円にならない)", () => {
    const r = parseLuminaCsv([HEADER, "2025-09-03,C001,A,トップス,S1,3,100,40"].join("\n"), SECRET);
    expect(r.rows[0].line_revenue).toBe(100);
    const s = summarize(r.rows, r.products, "2025-09");
    expect(s.revenue).toBe(100); // unit_price(33.33)×3 = 99.99 ではない
    expect(s.grossProfit).toBe(60);
  });

  it("原価が一部の行だけ空欄なら、合算した原価は null(粗利を過大にしない)", () => {
    const csv = [
      HEADER,
      "2025-09-03,C001,A,トップス,S1,1,3800,1400",
      "2025-09-03,C001,A,トップス,S1,2,7600,",
    ].join("\n");
    const r = parseLuminaCsv(csv, SECRET);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ qty: 3, line_revenue: 11400, line_cost: null });
    expect(r.products).toEqual([]); // 原価が揃っていないSKUは商品マスタの候補にしない
    // 原価不明のまま粗利に入れず、警告の対象になる
    const s = summarize(r.rows, [], "2025-09");
    expect(s.grossProfit).toBeNull();
    expect(s.missingCostSkus).toEqual(["S1"]);
  });

  it("同じ日の同じ顧客の買い物は、SKUが違っても1注文として数える", () => {
    const csv = [
      HEADER,
      "2025-09-03,C001,A,トップス,S1,1,1000,400",
      "2025-09-03,C001,B,ボトムス,S2,1,2000,800",
      "2025-09-03,C001,C,アウター,S3,1,3000,1200",
      "2025-09-04,C002,A,トップス,S1,1,1000,400",
    ].join("\n");
    const r = parseLuminaCsv(csv, SECRET);
    expect(r.rows).toHaveLength(4);
    expect(summarize(r.rows, r.products, "2025-09").orderCount).toBe(2);
  });

  it("日付の書き方が違っても同じ注文になる(再アップロードで二重登録されない)", () => {
    const a = parseLuminaCsv([HEADER, "2025-09-03,C001,A,トップス,S1,1,1000,400"].join("\n"), SECRET);
    const b = parseLuminaCsv([HEADER, "2025-09-03 00:00:00,C001,A,トップス,S1,1,1000,400"].join("\n"), SECRET);
    expect(b.rows[0].order_id).toBe(a.rows[0].order_id);
    expect(b.rows[0].order_id).toBe("2025-09-03|C001");
  });

  it("商品の単価原価は、原価合計÷数量合計で求める(最後の行の値ではない)", () => {
    const csv = [
      HEADER,
      "2025-09-03,C001,A,トップス,S1,1,1000,100",
      "2025-09-04,C002,A,トップス,S1,2,2000,100",
    ].join("\n");
    const r = parseLuminaCsv(csv, SECRET);
    expect(r.products).toEqual([{ sku: "S1", name: "A", category: "トップス", cost: 66.67 }]); // 200÷3
  });
});

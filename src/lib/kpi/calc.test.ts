import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import {
  changeRate,
  grossProfit,
  repeatRate,
  revenue,
  salesByCategory,
  summarizeMonth,
  topSkus,
} from "./calc";

const line = (o: Partial<Parameters<typeof revenue>[0][number]> & { order_id?: string } = {}) => ({
  order_id: "#1",
  sku: "A",
  category: null,
  qty: 1,
  unit_price: 1000,
  discount: 0,
  is_cancelled: false,
  customer_key: "c1",
  ...o,
});

const products = new Map<string, Product>([
  ["A", { sku: "A", name: "商品A", category: "食品", cost: 400 }],
  ["B", { sku: "B", name: "商品B", category: "雑貨", cost: 100 }],
]);

describe("revenue", () => {
  it("数量×単価−割引の合計。キャンセル行は除外", () => {
    const lines = [
      line({ qty: 2, unit_price: 1000, discount: 300 }), // 1700
      line({ sku: "B", qty: 1, unit_price: 500 }), // 500
      line({ qty: 5, is_cancelled: true }), // 除外
    ];
    expect(revenue(lines)).toBe(2200);
  });

  it("割引が売上を超えてもマイナスにしない", () => {
    expect(revenue([line({ unit_price: 100, discount: 500 })])).toBe(0);
  });

  it("空なら0", () => {
    expect(revenue([])).toBe(0);
  });
});

describe("grossProfit", () => {
  it("売上−原価を計算する", () => {
    const r = grossProfit([line({ qty: 2, unit_price: 1000 })], products);
    expect(r.grossProfit).toBe(2000 - 800);
    expect(r.coveredRevenue).toBe(2000);
    expect(r.missingCostSkus).toEqual([]);
  });

  it("原価未登録のSKUは計算から除外して警告対象にする", () => {
    const r = grossProfit([line({ sku: "ZZZ", unit_price: 9999 }), line({ qty: 1, unit_price: 1000 })], products);
    expect(r.grossProfit).toBe(600);
    expect(r.coveredRevenue).toBe(1000);
    expect(r.missingCostSkus).toEqual(["ZZZ"]);
  });
});

describe("repeatRate", () => {
  const lines = [
    line({ customer_key: "old" }),
    line({ customer_key: "new1" }),
    line({ customer_key: "new2" }),
    line({ customer_key: "old", sku: "B" }), // 同じ顧客は1人として数える
  ];

  it("当月購入者のうち過去に購入歴がある割合", () => {
    expect(repeatRate(lines, new Set(["old"]), true)).toBeCloseTo(1 / 3);
  });

  it("購入履歴が全くなければ判定不能(null)", () => {
    expect(repeatRate(lines, new Set(), false)).toBeNull();
  });

  it("履歴はあるが当月に過去客がいなければ0%", () => {
    expect(repeatRate(lines, new Set(["someone-else"]), true)).toBe(0);
  });

  it("当月の購入者がいなければ null、キャンセルのみの顧客は数えない", () => {
    expect(repeatRate([], new Set(["a"]), true)).toBeNull();
    expect(repeatRate([line({ is_cancelled: true })], new Set(["c1"]), true)).toBeNull();
  });
});

describe("salesByCategory / topSkus", () => {
  const lines = [
    line({ sku: "A", unit_price: 3000 }),
    line({ sku: "B", unit_price: 1000 }),
    line({ sku: "C", unit_price: 1000, category: "季節" }), // マスタ未登録→注文側カテゴリ
    line({ sku: "D", unit_price: 1000 }), // 完全に未分類
  ];

  it("カテゴリ別売上は多い順で、構成比の合計は1", () => {
    const result = salesByCategory(lines, products);
    expect(result[0]).toMatchObject({ category: "食品", revenue: 3000 });
    expect(result.map((c) => c.category)).toContain("未分類");
    expect(result.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1);
  });

  it("SKUトップNは売上順で件数を制限する", () => {
    const top = topSkus(lines, products, 2);
    expect(top).toHaveLength(2);
    expect(top[0]).toMatchObject({ sku: "A", name: "商品A", revenue: 3000 });
  });
});

describe("changeRate", () => {
  it("増減率を返し、比較元が0やnullならnull", () => {
    expect(changeRate(120, 100)).toBeCloseTo(0.2);
    expect(changeRate(80, 100)).toBeCloseTo(-0.2);
    expect(changeRate(10, 0)).toBeNull();
    expect(changeRate(null, 100)).toBeNull();
  });
});

describe("summarizeMonth", () => {
  it("データがない月は hasData=false で売上0", () => {
    const s = summarizeMonth({
      month: "2026-01",
      lines: [],
      products,
      priorCustomers: new Set(),
      hasHistory: false,
    });
    expect(s.hasData).toBe(false);
    expect(s.revenue).toBe(0);
    expect(s.grossProfit).toBeNull();
    expect(s.repeatRate).toBeNull();
  });

  it("注文数は注文番号の重複を除いて数える", () => {
    const s = summarizeMonth({
      month: "2026-01",
      lines: [line({ order_id: "#1" }), line({ order_id: "#1", sku: "B" }), line({ order_id: "#2" })],
      products,
      priorCustomers: new Set(),
      hasHistory: true,
    });
    expect(s.orderCount).toBe(2);
    expect(s.costCoverage).toBe(1);
  });
});

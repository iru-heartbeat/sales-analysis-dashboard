// 実際のSupabaseに接続する結合テスト。通常の `npm test` では実行されない(スキップされる)。
// 実行: INTEGRATION=1 TEST_EMAIL=... TEST_PASSWORD=... npm test
// 前提: テスト用ユーザー(marketer権限)が存在すること。DBに実データを書き込む(同じデータは重複しない)。
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { parseOrdersCsv } from "@/lib/csv/parseOrders";
import { parseProductsCsv } from "@/lib/csv/parseProducts";
import { fetchAvailableMonths, fetchDashboardData } from "./kpi";
import { importOrders, importProducts } from "./import";

const enabled = process.env.INTEGRATION === "1";

function loadEnv() {
  const text = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

describe.skipIf(!enabled)("結合テスト(実DB)", () => {
  it("サンプルCSVの取り込み → 二重取り込み防止 → 月次集計", async () => {
    const env = loadEnv();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    const { data: auth, error } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_EMAIL!,
      password: process.env.TEST_PASSWORD!,
    });
    expect(error).toBeNull();
    const userId = auth.user!.id;

    const products = parseProductsCsv(readFileSync("sample-data/products_sample.csv", "utf8"));
    expect(await importProducts(supabase, products.products)).toBe(true);

    const orders = parseOrdersCsv(readFileSync("sample-data/orders_sample.csv", "utf8"), env.CUSTOMER_KEY_SECRET);
    expect(orders.errors).toEqual([]);

    const first = await importOrders(supabase, userId, "orders_sample.csv", orders.rows);
    expect(first.ok).toBe(true);
    // 2回目は同じ内容で上書きされるだけで、二重計上されない(後の件数チェックで確認)
    const second = await importOrders(supabase, userId, "orders_sample.csv", orders.rows);
    expect(second).toEqual({ ok: true, processed: orders.rows.length });

    // 1000行を超えるページングが効いているか(全件がDBにあること)
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true });
    expect(count).toBe(orders.rows.length);

    const months = await fetchAvailableMonths(supabase);
    expect(months[0]).toBe("2025-09");
    expect(months[months.length - 1]).toBe("2026-10");

    const data = await fetchDashboardData(supabase, "2026-10");
    // 期待値はCSVから独立に計算し、DB経由の集計結果と突き合わせる
    const expectedRevenue = orders.rows
      .filter((r) => r.ordered_at.startsWith("2026-10") && !r.is_cancelled)
      .reduce((s, r) => s + Math.max(0, r.qty * r.unit_price - r.discount), 0);
    expect(data.current.revenue).toBe(expectedRevenue);
    expect(data.current.missingCostSkus).toEqual(["GDS-003"]);
    expect(data.current.repeatRate).not.toBeNull();
    expect(data.changes.revenueMom).not.toBeNull();
    expect(data.changes.revenueYoy).not.toBeNull(); // 前年同月(2025-10)のデータがある

    // 後から返金された注文を再取り込みすると、売上から除外される(更新が反映される)
    const target = orders.rows.find((r) => r.ordered_at.startsWith("2026-10") && !r.is_cancelled)!;
    const lost = Math.max(0, target.qty * target.unit_price - target.discount);
    const refunded = orders.rows.map((r) =>
      r.order_id === target.order_id && r.sku === target.sku ? { ...r, is_cancelled: true } : r,
    );
    expect((await importOrders(supabase, userId, "refund.csv", refunded)).ok).toBe(true);
    const afterRefund = await fetchDashboardData(supabase, "2026-10");
    expect(afterRefund.current.revenue).toBe(expectedRevenue - lost);

    // 元に戻す(テストデータを元の状態にしておく)
    expect((await importOrders(supabase, userId, "restore.csv", orders.rows)).ok).toBe(true);
    expect((await fetchDashboardData(supabase, "2026-10")).current.revenue).toBe(expectedRevenue);
  }, 90_000);
});

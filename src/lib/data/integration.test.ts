// 実際のSupabaseに接続する結合テスト。通常の `npm test` では実行されない(スキップされる)。
// 実行: INTEGRATION=1 TEST_EMAIL=... TEST_PASSWORD=... npm test
// 前提:
//  - テスト用ユーザー(承認済みのmarketer)が存在すること
//  - DBの2025年9〜11月に、公式サンプル(tests/fixtures/sample-sales.csv)以外のデータがないこと
// 実DBに書き込むが、同じ注文は上書きされるだけで、テストの最後に元の内容へ戻す。
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { parseLuminaCsv } from "@/lib/csv/parseLumina";
import { importOrders, importProducts } from "./import";
import { fetchAvailableMonths, fetchDashboardData } from "./kpi";

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

describe.skipIf(!enabled)("結合テスト(実DB・公式サンプル)", () => {
  it("取り込み → 上書き(二重計上しない) → 月次集計 → 返金の反映", async () => {
    const env = loadEnv();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    const { data: auth, error } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_EMAIL!,
      password: process.env.TEST_PASSWORD!,
    });
    expect(error).toBeNull();
    const userId = auth.user!.id;

    const parsed = parseLuminaCsv(readFileSync("tests/fixtures/sample-sales.csv", "utf8"), env.CUSTOMER_KEY_SECRET);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(40);

    // 取り込み。2回目も同じ結果で、二重に増えない
    expect((await importProducts(supabase, parsed.products, { onlyNew: true })) ).toBe(true);
    expect(await importOrders(supabase, userId, "sample-sales.csv", parsed.rows)).toEqual({ ok: true, processed: 40 });
    expect(await importOrders(supabase, userId, "sample-sales.csv", parsed.rows)).toEqual({ ok: true, processed: 40 });
    const ids = parsed.rows.map((r) => r.order_id);
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).in("order_id", ids);
    expect(count).toBe(40);

    expect(await fetchAvailableMonths(supabase)).toEqual(["2025-09", "2025-10", "2025-11"]);

    // 説明書の正解値と、DB経由の集計が一致する
    const nov = await fetchDashboardData(supabase, "2025-11");
    expect(nov.current.revenue).toBe(264_700);
    expect(nov.current.grossProfit).toBe(163_100);
    expect(nov.current.orderCount).toBe(15);
    expect(nov.current.repeatRate).toBeCloseTo(7 / 15);
    expect(nov.changes.revenueMom).toBeCloseTo(264_700 / 147_500 - 1);
    expect(nov.changes.revenueYoy).toBeNull(); // 前年同月のデータはない
    const sep = await fetchDashboardData(supabase, "2025-09");
    expect(sep.current.revenue).toBe(148_400);
    expect(sep.current.repeatRate).toBeNull(); // 過去の履歴がない

    // 後から返金された注文を再取り込みすると、売上から除外される
    const target = parsed.rows.find((r) => r.order_id === "2025-11-01|C001")!; // ウールコート 24,800円
    const refunded = parsed.rows.map((r) => (r === target ? { ...r, is_cancelled: true } : r));
    expect((await importOrders(supabase, userId, "refund.csv", refunded)).ok).toBe(true);
    expect((await fetchDashboardData(supabase, "2025-11")).current.revenue).toBe(264_700 - 24_800);

    // 元に戻す
    expect((await importOrders(supabase, userId, "restore.csv", parsed.rows)).ok).toBe(true);
    expect((await fetchDashboardData(supabase, "2025-11")).current.revenue).toBe(264_700);
  }, 90_000);
});

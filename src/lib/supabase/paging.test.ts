import { describe, expect, it } from "vitest";
import { fetchAllPages } from "./paging";

// Supabaseは1回のSELECTで1000行までしか返さない。それを超える件数も全件取れるかを、DBなしで確かめる。
function fakeTable(total: number) {
  const calls: [number, number][] = [];
  const build = (from: number, to: number) => {
    calls.push([from, to]);
    const rows = Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => ({ id: from + i }));
    return Promise.resolve({ data: rows, error: null });
  };
  return { build, calls };
}

describe("fetchAllPages", () => {
  it("1000行を超える件数を、重複・取りこぼしなく全件取得する", async () => {
    const { build, calls } = fakeTable(2345);
    const rows = await fetchAllPages(build);
    expect(rows).toHaveLength(2345);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2345);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("ちょうど1000行のときは、空のページを1回確認して終わる", async () => {
    const { build, calls } = fakeTable(1000);
    expect(await fetchAllPages(build)).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it("0件なら空配列", async () => {
    const { build } = fakeTable(0);
    expect(await fetchAllPages(build)).toEqual([]);
  });

  it("エラーが返ったら例外にする", async () => {
    await expect(
      fetchAllPages(() => Promise.resolve({ data: null, error: { message: "boom" } })),
    ).rejects.toThrow("boom");
  });
});

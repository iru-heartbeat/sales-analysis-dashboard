import { describe, expect, it } from "vitest";
import { addMonths, isMonthKey, monthRange, monthsBetween, toMonthKey } from "./month";

describe("month", () => {
  it("日本時間で月を判定する(UTCでは前月でもJSTでは翌月)", () => {
    // 2026-01-31 16:00 UTC = 2026-02-01 01:00 JST
    expect(toMonthKey("2026-01-31T16:00:00Z")).toBe("2026-02");
    expect(toMonthKey("2026-01-31T14:59:59Z")).toBe("2026-01");
  });

  it("月の加減算が年をまたぐ", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-03", -12)).toBe("2025-03");
  });

  it("月の範囲は翌月1日の0時(JST)まで", () => {
    expect(monthRange("2026-12")).toEqual({
      start: "2026-12-01T00:00:00+09:00",
      end: "2027-01-01T00:00:00+09:00",
    });
  });

  it("monthsBetween は両端を含む", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("isMonthKey は不正な値を弾く", () => {
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
    expect(isMonthKey("2026-05")).toBe(true);
  });
});

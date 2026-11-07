import { describe, expect, it } from "vitest";
import { decodeCsvBuffer } from "./decode";
import { parseOrderedAt, parseOrdersCsv } from "./parseOrders";
import { parseProductsCsv } from "./parseProducts";

const SECRET = "test-secret";
const HEADER = "Name,Email,Created at,Financial Status,Cancelled at,Discount Amount,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku";

describe("parseOrderedAt", () => {
  it("Shopify形式・ISO形式・タイムゾーンなしを解釈する", () => {
    expect(parseOrderedAt("2026-01-05 12:34:56 +0900")).toBe("2026-01-05T12:34:56+09:00");
    expect(parseOrderedAt("2026-01-05T03:00:00Z")).toBe("2026-01-05T03:00:00Z");
    expect(parseOrderedAt("2026-01-05")).toBe("2026-01-05T00:00:00+09:00");
  });
  it("不正な日付は null", () => {
    expect(parseOrderedAt("昨日")).toBeNull();
    expect(parseOrderedAt("2026-13-45")).toBeNull();
  });
});

describe("parseOrdersCsv", () => {
  it("注文の先頭行の情報を後続行へ引き継ぐ", () => {
    const csv = [
      HEADER,
      "#1001,a@example.com,2026-01-05 10:00:00 +0900,paid,,100,2,Tシャツ,3000,TS-01",
      "#1001,,,,,,1,キャップ,2000,CP-01",
    ].join("\n");
    const r = parseOrdersCsv(csv, SECRET);
    expect(r.fatal).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1].customer_key).toBe(r.rows[0].customer_key);
    expect(r.rows[1].ordered_at).toBe("2026-01-05T10:00:00+09:00");
  });

  it("メールは保存されずハッシュ化され、大文字小文字・空白を無視して同一視される", () => {
    const csv = [
      HEADER,
      "#1,User@Example.com,2026-01-05 10:00:00 +0900,paid,,0,1,A,1000,A",
      "#2, user@example.com ,2026-01-06 10:00:00 +0900,paid,,0,1,A,1000,A",
    ].join("\n");
    const r = parseOrdersCsv(csv, SECRET);
    expect(r.rows[0].customer_key).toBe(r.rows[1].customer_key);
    expect(r.rows[0].customer_key).not.toContain("example");
  });

  it("メールがない注文は他の注文と同一視しない", () => {
    const csv = [
      HEADER,
      "#1,,2026-01-05 10:00:00 +0900,paid,,0,1,A,1000,A",
      "#2,,2026-01-06 10:00:00 +0900,paid,,0,1,A,1000,A",
    ].join("\n");
    const r = parseOrdersCsv(csv, SECRET);
    expect(r.rows[0].customer_key).not.toBe(r.rows[1].customer_key);
  });

  it("返金・キャンセルを is_cancelled にする", () => {
    const csv = [
      HEADER,
      "#1,a@x.com,2026-01-05 10:00:00 +0900,refunded,,0,1,A,1000,A",
      "#2,b@x.com,2026-01-05 10:00:00 +0900,paid,2026-01-06 09:00:00 +0900,0,1,A,1000,A",
      "#3,c@x.com,2026-01-05 10:00:00 +0900,paid,,0,1,A,1000,A",
    ].join("\n");
    const r = parseOrdersCsv(csv, SECRET);
    expect(r.rows.map((x) => x.is_cancelled)).toEqual([true, true, false]);
  });

  it("同じ注文の同じSKUは数量を合算する", () => {
    const csv = [
      HEADER,
      "#1,a@x.com,2026-01-05 10:00:00 +0900,paid,,0,1,A,1000,A",
      "#1,,,,,,2,A,1000,A",
    ].join("\n");
    const r = parseOrdersCsv(csv, SECRET);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].qty).toBe(3);
  });

  it("不正な行は行番号付きのエラーにして、他の行は取り込む", () => {
    const csv = [
      HEADER,
      "#1,a@x.com,2026-01-05 10:00:00 +0900,paid,,0,abc,A,1000,A",
      "#2,a@x.com,日付じゃない,paid,,0,1,A,1000,A",
      "#3,a@x.com,2026-01-05 10:00:00 +0900,paid,,0,1,A,1000,A",
    ].join("\n");
    const r = parseOrdersCsv(csv, SECRET);
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
  });

  it("SKUのない送料行は無視する", () => {
    const csv = [
      HEADER,
      "#1,a@x.com,2026-01-05 10:00:00 +0900,paid,,0,1,A,1000,A",
      "#1,,,,,,1,,500,",
    ].join("\n");
    const r = parseOrdersCsv(csv, SECRET);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });

  it("必須列がなければ fatal", () => {
    const r = parseOrdersCsv("foo,bar\n1,2", SECRET);
    expect(r.fatal).toContain("必須の列");
  });

  it("1e3・0x10・負数・桁あふれの数値は受け付けない", () => {
    let n = 0;
    const row = (qty: string, price: string, discount = "0") =>
      `#${++n},a@x.com,2026-01-05 10:00:00 +0900,paid,,${discount},${qty},A,${price},A`;
    const csv = [
      HEADER,
      row("1e3", "1000"), // 指数表記
      row("0x10", "1000"), // 16進数
      row("1", "-500"), // 負数
      row("1", "99999999999999"), // 上限超過
      row("99999999999", "1000"), // 数量が上限超過
      row("2", '"1,200"'), // カンマ区切りはOK(CSV上は引用符で囲む)
    ].join("\n");
    const r = parseOrdersCsv(csv, SECRET);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ qty: 2, unit_price: 1200 });
    expect(r.errors).toHaveLength(5);
  });

  it("引用符が閉じていないCSVは取り込まない", () => {
    const csv = [HEADER, '#1,a@x.com,2026-01-05 10:00:00 +0900,paid,,0,1,"壊れた商品名,1000,A', "#2,b@x.com,2026-01-05 10:00:00 +0900,paid,,0,1,B,1000,B"].join("\n");
    const r = parseOrdersCsv(csv, SECRET);
    expect(r.fatal).toContain("引用符");
    expect(r.rows).toEqual([]);
  });

  it("長すぎる文字列は切り詰める", () => {
    const longSku = "S".repeat(500);
    const csv = [HEADER, `#1,a@x.com,2026-01-05 10:00:00 +0900,paid,,0,1,A,1000,${longSku}`].join("\n");
    const r = parseOrdersCsv(csv, SECRET);
    expect(r.rows[0].sku).toHaveLength(200);
  });
});

describe("parseProductsCsv", () => {
  it("SKU・原価を読み、原価が不正な行はエラー", () => {
    const r = parseProductsCsv("sku,name,category,cost\nA,商品A,食品,\"1,200\"\nB,商品B,雑貨,abc\n,商品C,雑貨,100");
    expect(r.products).toEqual([{ sku: "A", name: "商品A", category: "食品", cost: 1200 }]);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });

  it("日本語ヘッダーに対応し、同じSKUは後の行が優先", () => {
    const r = parseProductsCsv("商品コード,商品名,カテゴリ,原価\nA,旧,食品,100\nA,新,食品,200");
    expect(r.products).toHaveLength(1);
    expect(r.products[0]).toMatchObject({ name: "新", cost: 200 });
  });

  it("必須列がなければ fatal", () => {
    expect(parseProductsCsv("a,b\n1,2").fatal).toContain("必須の列");
  });

  it("原価が指数表記・負数・上限超過ならエラー", () => {
    const r = parseProductsCsv("sku,cost\nA,1e3\nB,-5\nC,99999999999999\nD,0\nE,350.5");
    expect(r.products.map((p) => p.sku)).toEqual(["D", "E"]);
    expect(r.errors).toHaveLength(3);
  });
});

describe("decodeCsvBuffer", () => {
  it("UTF-8(BOM付き)を読める", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("商品")]);
    expect(decodeCsvBuffer(bytes.buffer)).toBe("商品");
  });

  it("UTF-8として不正なバイト列は Shift_JIS として読む", () => {
    // 「商品」の Shift_JIS
    const sjis = new Uint8Array([0x8f, 0xa4, 0x95, 0x69]);
    expect(decodeCsvBuffer(sjis.buffer)).toBe("商品");
  });
});

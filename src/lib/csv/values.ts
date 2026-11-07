// CSVの値の検証。DBの列(integer / numeric(12,2))に入らない値を、取り込み前に弾く。

export const MAX_TEXT_LENGTH = 200;
export const MAX_QTY = 1_000_000;
export const MAX_MONEY = 1_000_000_000; // 10億円

/** 長すぎる文字列を切り詰める(DB・AIプロンプトの肥大化対策) */
export function clip(value: string): string {
  return value.trim().slice(0, MAX_TEXT_LENGTH);
}

/**
 * 金額・数量などの非負の数値をパースする。
 * カンマ・空白・円記号は取り除くが、"1e3" や "0x10" のような書き方は受け付けない。
 * 不正・負数・上限超過は null。小数は2桁に丸める。
 */
export function parseNonNegative(value: string | undefined, max: number): number | null {
  if (value === undefined) return null;
  const cleaned = value.replace(/[,\s¥円]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n > max) return null;
  return Math.round(n * 100) / 100;
}

/** 数量: 非負の整数 */
export function parseQty(value: string | undefined): number | null {
  const n = parseNonNegative(value, MAX_QTY);
  return n !== null && Number.isInteger(n) ? n : null;
}

// 月の扱い。売上の「月」は日本時間(JST, UTC+9)で区切る。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 月キー "YYYY-MM" の形式チェック */
export function isMonthKey(value: string | undefined | null): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** 日時(ISO文字列/Date)を日本時間の月キーにする */
export function toMonthKey(value: string | Date): string {
  const d = new Date(typeof value === "string" ? Date.parse(value) : value.getTime());
  const jst = new Date(d.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** その月の開始(含む)と終了(含まない)をタイムゾーン付きISO文字列で返す */
export function monthRange(key: string): { start: string; end: string } {
  return {
    start: `${key}-01T00:00:00+09:00`,
    end: `${addMonths(key, 1)}-01T00:00:00+09:00`,
  };
}

/** from〜to(両端含む)の月キー一覧 */
export function monthsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) result.push(k);
  return result;
}

export function formatMonthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y}年${Number(m)}月`;
}

/**
 * CSVのバイト列を文字列に変換する。
 * まず UTF-8(BOM付きも可)で厳密に読み、失敗したら Shift_JIS(Excel由来の日本語CSV)として読む。
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return stripBom(text);
  } catch {
    return stripBom(new TextDecoder("shift_jis").decode(buffer));
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

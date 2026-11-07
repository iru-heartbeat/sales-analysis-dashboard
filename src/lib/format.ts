export const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

export const percent = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`;

/** 増減率: +12.3% / -4.5% */
export const signedPercent = (ratio: number, digits = 1) =>
  `${ratio >= 0 ? "+" : ""}${(ratio * 100).toFixed(digits)}%`;

/** ポイント差: +1.2pt / -0.5pt */
export const signedPoints = (ratioDiff: number, digits = 1) =>
  `${ratioDiff >= 0 ? "+" : ""}${(ratioDiff * 100).toFixed(digits)}pt`;

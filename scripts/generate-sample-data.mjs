// 動作確認用のダミーデータ(Shopify注文CSV形式 + 商品マスタ)を sample-data/ に出力する。
// 実行: node scripts/generate-sample-data.mjs
// 乱数は固定シードなので、何度実行しても同じ内容になる。メールは架空のドメイン(example.com)。
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../sample-data/", import.meta.url);
mkdirSync(OUT, { recursive: true });

let seed = 20261101;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const products = [
  ["COF-001", "ブレンドコーヒー豆 200g", "コーヒー", 1800, 700],
  ["COF-002", "エチオピア シングル 200g", "コーヒー", 2400, 1000],
  ["COF-003", "ドリップバッグ 10個", "コーヒー", 1200, 450],
  ["TEA-001", "アールグレイ 50g", "紅茶", 1500, 560],
  ["TEA-002", "ダージリン 50g", "紅茶", 1900, 800],
  ["SWT-001", "焼き菓子ギフト", "お菓子", 3200, 1400],
  ["SWT-002", "チョコレート詰め合わせ", "お菓子", 2800, 1200],
  ["SWT-003", "クッキー缶", "お菓子", 2200, 900],
  ["GDS-001", "マグカップ", "雑貨", 1600, 800],
  ["GDS-002", "ドリッパー", "雑貨", 2900, 1300],
  ["GDS-003", "オリジナルトート", "雑貨", 1800, 600],
];
const categoryWeights = { コーヒー: 3, 紅茶: 2, お菓子: 2, 雑貨: 1 };
const weighted = products.flatMap((p) => Array(categoryWeights[p[2]]).fill(p));

const pad = (n) => String(n).padStart(2, "0");
const rows = [
  "Name,Email,Created at,Financial Status,Cancelled at,Discount Amount,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku",
];
let orderNo = 1000;
const customerCount = 220;

// 2025-09 〜 2026-10 の14か月。徐々に注文数が増える
for (let i = 0; i < 14; i++) {
  const y = 2025 + Math.floor((8 + i) / 12);
  const m = ((8 + i) % 12) + 1;
  const orders = 30 + i * 3 + Math.floor(rand() * 8);
  for (let o = 0; o < orders; o++) {
    orderNo++;
    // 後の月ほど既存客(番号が小さい顧客)が増える = リピート率が上がっていく
    const pool = Math.min(customerCount, 40 + i * 14);
    const customer = rand() < 0.35 + i * 0.015 ? Math.floor(rand() * Math.min(pool, 120)) : Math.floor(rand() * pool);
    const email = `customer${customer}@example.com`;
    const day = 1 + Math.floor(rand() * 27);
    const date = `${y}-${pad(m)}-${pad(day)} ${pad(9 + Math.floor(rand() * 12))}:${pad(Math.floor(rand() * 60))}:00 +0900`;
    const refunded = rand() < 0.03;
    const discount = rand() < 0.2 ? 300 : 0;
    const lineCount = 1 + Math.floor(rand() * 3);
    const used = new Set();
    for (let l = 0; l < lineCount; l++) {
      let p = pick(weighted);
      if (used.has(p[0])) continue;
      used.add(p[0]);
      const qty = 1 + Math.floor(rand() * 3);
      const first = used.size === 1;
      rows.push(
        [
          `#${orderNo}`,
          first ? email : "",
          first ? date : "",
          first ? (refunded ? "refunded" : "paid") : "",
          "",
          first ? discount : "",
          qty,
          p[1],
          p[3],
          p[0],
        ].join(","),
      );
    }
  }
}
writeFileSync(new URL("orders_sample.csv", OUT), rows.join("\n") + "\n", "utf8");

// 商品マスタ。GDS-003 はあえて原価を載せない(原価未登録の警告を確認するため)
const master = ["sku,name,category,cost"];
for (const p of products) if (p[0] !== "GDS-003") master.push(`${p[0]},${p[1]},${p[2]},${p[4]}`);
writeFileSync(new URL("products_sample.csv", OUT), master.join("\n") + "\n", "utf8");

console.log(`orders: ${rows.length - 1} lines, products: ${master.length - 1}`);

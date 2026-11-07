-- 注文行ごとの原価(合計)。CSVに行ごとの原価が入っている形式(案件8のLUMINA形式)用。
-- null のときは、従来どおり商品マスタ(products.cost)× 数量で粗利を計算する。
-- 既存データ・既存コードに影響しない、追加のみの変更(null許容)。
alter table public.orders
  add column line_cost numeric(14, 2) check (line_cost is null or line_cost >= 0);

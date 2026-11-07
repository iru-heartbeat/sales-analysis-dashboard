-- 注文行ごとの売上(合計・割引前)。CSVに行ごとの売上合計が入っている形式(LUMINA形式)用。
-- 単価×数量から逆算すると、100円÷3個のように割り切れない金額で、CSVの金額とずれるため(99.99円になる等)。
-- null のときは、従来どおり 数量 × 単価 で計算する。追加のみの変更(null許容)で、既存データに影響しない。
alter table public.orders
  add column line_revenue numeric(14, 2) check (line_revenue is null or line_revenue >= 0);

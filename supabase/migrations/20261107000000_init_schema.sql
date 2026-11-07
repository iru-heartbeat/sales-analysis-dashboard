-- 売上分析ダッシュボード 初期スキーマ

-- ユーザーの役割(marketer = アップロード可能 / viewer = 閲覧のみ)
create type public.app_role as enum ('marketer', 'viewer');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now()
);

-- サインアップ時に profiles を自動作成(既定は viewer)
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 呼び出しユーザーが marketer かどうか(RLSポリシーで使用)
create function public.is_marketer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'marketer'
  );
$$;

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  period_month date not null, -- 対象月(その月の1日)
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads (id) on delete cascade,
  order_id text not null,
  ordered_at timestamptz not null,
  customer_key text not null, -- メールアドレスのハッシュ(個人情報は保存しない)
  sku text not null,
  category text,
  qty integer not null check (qty >= 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  is_cancelled boolean not null default false, -- 返品・キャンセル行
  unique (order_id, sku)
);
create index orders_ordered_at_idx on public.orders (ordered_at);
create index orders_customer_key_idx on public.orders (customer_key);
create index orders_upload_id_idx on public.orders (upload_id);

create table public.products (
  sku text primary key,
  name text,
  category text,
  cost numeric(12, 2) not null check (cost >= 0)
);

-- 集計結果のキャッシュ
create table public.monthly_kpi (
  month date primary key,
  revenue numeric(14, 2) not null,
  gross_profit numeric(14, 2),
  repeat_rate numeric(5, 4),
  updated_at timestamptz not null default now()
);

-- AI分析コメント
create table public.ai_comments (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  summary text not null,
  actions jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);
create index ai_comments_month_idx on public.ai_comments (month, created_at desc);

-- RLS: 認証済みユーザーは閲覧可、書き込みは marketer のみ
alter table public.profiles enable row level security;
alter table public.uploads enable row level security;
alter table public.orders enable row level security;
alter table public.products enable row level security;
alter table public.monthly_kpi enable row level security;
alter table public.ai_comments enable row level security;

create policy "自分のprofileを閲覧" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "認証済みは閲覧可" on public.uploads
  for select to authenticated using (true);
create policy "marketerのみ書込" on public.uploads
  for all to authenticated
  using ((select public.is_marketer())) with check ((select public.is_marketer()));

create policy "認証済みは閲覧可" on public.orders
  for select to authenticated using (true);
create policy "marketerのみ書込" on public.orders
  for all to authenticated
  using ((select public.is_marketer())) with check ((select public.is_marketer()));

create policy "認証済みは閲覧可" on public.products
  for select to authenticated using (true);
create policy "marketerのみ書込" on public.products
  for all to authenticated
  using ((select public.is_marketer())) with check ((select public.is_marketer()));

create policy "認証済みは閲覧可" on public.monthly_kpi
  for select to authenticated using (true);
create policy "marketerのみ書込" on public.monthly_kpi
  for all to authenticated
  using ((select public.is_marketer())) with check ((select public.is_marketer()));

create policy "認証済みは閲覧可" on public.ai_comments
  for select to authenticated using (true);
create policy "marketerのみ書込" on public.ai_comments
  for all to authenticated
  using ((select public.is_marketer())) with check ((select public.is_marketer()));

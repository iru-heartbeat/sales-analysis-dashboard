-- 強化: 「自己サインアップしただけのユーザー」はデータを読めないようにする。
-- Supabaseの公開キーは誰でも使えるため、サインアップが開いていると誰でも authenticated になれる。
-- 管理者が profiles.approved = true にしたユーザーだけを「メンバー」として扱う。

alter table public.profiles add column approved boolean not null default false;

create function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and approved
  );
$$;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- marketer も承認済みであることを必須にする
create or replace function public.is_marketer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'marketer' and approved
  );
$$;

-- 閲覧ポリシーを「承認済みメンバーのみ」に差し替え
drop policy "認証済みは閲覧可" on public.uploads;
drop policy "認証済みは閲覧可" on public.orders;
drop policy "認証済みは閲覧可" on public.products;
drop policy "認証済みは閲覧可" on public.monthly_kpi;
drop policy "認証済みは閲覧可" on public.ai_comments;

create policy "承認済みメンバーは閲覧可" on public.uploads
  for select to authenticated using ((select public.is_member()));
create policy "承認済みメンバーは閲覧可" on public.orders
  for select to authenticated using ((select public.is_member()));
create policy "承認済みメンバーは閲覧可" on public.products
  for select to authenticated using ((select public.is_member()));
create policy "承認済みメンバーは閲覧可" on public.monthly_kpi
  for select to authenticated using ((select public.is_member()));
create policy "承認済みメンバーは閲覧可" on public.ai_comments
  for select to authenticated using ((select public.is_member()));

-- AI生成の試行ログ(失敗した試行も数えて、コスト上限を確実にするため)
create table public.ai_generation_log (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_generation_log_created_at_idx on public.ai_generation_log (created_at desc);
alter table public.ai_generation_log enable row level security;
create policy "marketerのみ閲覧・追加" on public.ai_generation_log
  for all to authenticated
  using ((select public.is_marketer())) with check ((select public.is_marketer()));

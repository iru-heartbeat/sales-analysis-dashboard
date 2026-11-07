-- 外部(REST API の rpc)から SECURITY DEFINER 関数を直接呼べないようにする
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- is_marketer は RLS ポリシー評価のため authenticated にだけ実行権限を残す
revoke execute on function public.is_marketer() from public, anon;
grant execute on function public.is_marketer() to authenticated;

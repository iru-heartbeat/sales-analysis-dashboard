import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  isMarketer: boolean;
} | null;

/** ログイン中のユーザーと、アップロード権限(marketer)の有無を返す */
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role, approved").eq("id", user.id).maybeSingle();
  // 管理者が承認(approved)していないユーザーは、権限を持たない
  return { id: user.id, isMarketer: data?.approved === true && data?.role === "marketer" };
}

import Link from "next/link";
import { logout } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";

// ログイン中だけナビゲーションと「ログアウト」を表示する。
// Cookie(ログイン状態)を読むため、呼び出し側で <Suspense> で囲むこと。
export async function AuthControls() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <div className="flex items-center gap-4 text-sm">
      <Link href="/" className="hover:underline">
        ダッシュボード
      </Link>
      <Link href="/upload" className="hover:underline">
        アップロード
      </Link>
      <form action={logout}>
        <button type="submit" className="underline">
          ログアウト
        </button>
      </form>
    </div>
  );
}

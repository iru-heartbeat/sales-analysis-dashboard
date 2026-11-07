import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// サーバー側(Server Component / Server Action)で使うSupabaseクライアント
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component からの呼び出しでは Cookie を書けない。
            // セッション更新は proxy.ts 側で行うので無視してよい。
          }
        },
      },
    },
  );
}

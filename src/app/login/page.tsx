"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <section className="mx-auto mt-12 w-full max-w-sm rounded-lg border border-border bg-muted p-8">
      <h1 className="text-xl font-semibold text-brand">ログイン</h1>
      <form action={formAction} className="mt-6 space-y-4">
        <label className="block text-sm">
          メールアドレス
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          パスワード
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded border border-border bg-white px-3 py-2"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-brand px-4 py-2 font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    </section>
  );
}

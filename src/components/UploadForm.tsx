"use client";

import { useActionState } from "react";
import { initialUploadState, type UploadState } from "@/app/upload/state";

type Props = {
  title: string;
  description: string;
  action: (prev: UploadState, formData: FormData) => Promise<UploadState>;
};

export function UploadForm({ title, description, action }: Props) {
  const [state, formAction, pending] = useActionState(action, initialUploadState);

  return (
    <section className="rounded-lg border border-border bg-muted p-6">
      <h2 className="text-lg font-semibold text-brand">{title}</h2>
      <p className="mt-1 text-sm text-foreground/70">{description}</p>
      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-brand file:px-3 file:py-2 file:text-brand-foreground"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "取り込み中..." : "アップロード"}
        </button>
      </form>

      {state.status !== "idle" && (
        <div
          role={state.status === "error" ? "alert" : "status"}
          className={`mt-4 rounded border px-3 py-2 text-sm ${
            state.status === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          <p>{state.message}</p>
          {state.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {state.errors.map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  {e.line}行目: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

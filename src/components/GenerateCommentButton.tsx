"use client";

import { useActionState } from "react";
import { generateAiComment } from "@/app/ai/actions";
import { initialAiState } from "@/app/ai/state";

export function GenerateCommentButton({ month, hasComment }: { month: string; hasComment: boolean }) {
  const [state, formAction, pending] = useActionState(generateAiComment, initialAiState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
      >
        {pending ? "生成中...(1分ほどかかります)" : hasComment ? "再生成する" : "AIコメントを生成"}
      </button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}

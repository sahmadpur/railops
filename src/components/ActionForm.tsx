"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/actions/registry";

/**
 * Thin wrapper so every registry page gets pending state and translated feedback
 * without each one repeating useActionState. The inputs stay plain markup in the
 * page that owns them.
 */
export default function ActionForm({
  action,
  submitText,
  messages,
  children,
  className,
  compact = false,
}: {
  action: (prev: ActionResult | undefined, formData: FormData) => Promise<ActionResult>;
  submitText: string;
  /** Error code -> translated sentence. `saved` holds the success text. */
  messages: Record<string, string>;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className={className}>
      {children}
      <button
        type="submit"
        disabled={pending}
        className={`btn btn-primary ${compact ? "px-2 py-1 text-xs" : ""}`}
      >
        {submitText}
      </button>
      {state?.ok === true && <span className="text-accent ms-2 text-xs">{messages.saved}</span>}
      {state?.ok === false && (
        <span role="alert" className="text-danger ms-2 text-xs">
          {messages[state.error] ?? messages.generic}
        </span>
      )}
    </form>
  );
}

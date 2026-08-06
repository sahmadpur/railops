"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/actions/registry";

/**
 * Delete control for the registry lists. Separate from ActionForm because deletion asks for
 * confirmation first and never renders as a primary button. The hidden fields are supplied by
 * the caller, so the same component serves every table.
 */
export default function DeleteButton({
  action,
  labels,
  children,
}: {
  action: (prev: ActionResult | undefined, formData: FormData) => Promise<ActionResult>;
  /** `delete` is the button text, `confirm` the browser prompt, the rest are error codes. */
  labels: Record<string, string>;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirm(labels.confirm)) event.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      {children}
      <button type="submit" disabled={pending} className="btn text-danger px-2 py-1 text-xs">
        {labels.delete}
      </button>
      {state?.ok === false && (
        <span role="alert" className="text-danger text-[11px]">
          {labels[state.error] ?? labels.generic}
        </span>
      )}
    </form>
  );
}

"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/actions/registry";

/**
 * The actions cell of an editable registry row, and the owner of that row's <form>.
 *
 * A <form> cannot wrap <td>s, so the form element lives alone in this cell while the row's fields
 * stay in their own cells, wired to it by HTML's `form="<id>"` attribute. The alternative — one
 * colSpan cell holding every field — leaves the values unaligned with the column headers above.
 * The page picks `formId` (it must be unique in the document) and repeats it on each field.
 */
export default function RowForm({
  formId,
  action,
  submitText,
  messages,
  hidden,
  actions,
}: {
  /** Must match the `form` attribute on every field this row submits. */
  formId: string;
  action: (prev: ActionResult | undefined, formData: FormData) => Promise<ActionResult>;
  submitText: string;
  /** Error code -> translated sentence. `saved` holds the success text. */
  messages: Record<string, string>;
  /** Fields the row submits but never shows, such as the row id. */
  hidden?: Record<string, string | number>;
  /** Extra controls for this cell, such as delete. */
  actions?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <td className="whitespace-nowrap">
      <div className="flex items-center gap-2">
        <form id={formId} action={formAction}>
          {Object.entries(hidden ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        </form>
        <button type="submit" form={formId} disabled={pending} className="btn btn-primary px-2 py-1 text-xs">
          {submitText}
        </button>
        {actions}
      </div>
      {state?.ok === true && <span className="text-success text-xs">{messages.saved}</span>}
      {state?.ok === false && (
        <span role="alert" className="text-danger text-xs">
          {messages[state.error] ?? messages.generic}
        </span>
      )}
    </td>
  );
}

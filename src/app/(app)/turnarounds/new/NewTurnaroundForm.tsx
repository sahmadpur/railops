"use client";

import { useActionState } from "react";

import { createTurnaround } from "@/actions/turnaround";

export default function NewTurnaroundForm({
  today,
  labels,
}: {
  today: string;
  labels: {
    trainNumber: string;
    cycleDate: string;
    submit: string;
    /** Keyed by the rule code the server returns; `generic` is the fallback. */
    errors: Record<string, string>;
  };
}) {
  const [state, action, pending] = useActionState(createTurnaround, undefined);
  // A successful create redirects from the server, so there is nothing to do on ok here.

  return (
    <form action={action} className="card space-y-4 p-6">
      <label className="block">
        <span className="text-muted mb-1.5 block text-xs font-medium">{labels.trainNumber}</span>
        <input name="trainNumber" required autoFocus autoComplete="off" inputMode="numeric" className="field" />
      </label>

      <label className="block">
        <span className="text-muted mb-1.5 block text-xs font-medium">{labels.cycleDate}</span>
        <input type="date" name="cycleDate" required defaultValue={today} className="field" />
      </label>

      {state?.ok === false && (
        <p role="alert" className="text-danger text-xs">
          {labels.errors[state.error] ?? labels.errors.generic}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {labels.submit}
      </button>
    </form>
  );
}

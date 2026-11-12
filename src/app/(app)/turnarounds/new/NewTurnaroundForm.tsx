"use client";

import { useActionState } from "react";

import { createTurnaround } from "@/actions/turnaround";

export default function NewTurnaroundForm({
  today,
  routes,
  labels,
}: {
  today: string;
  /** Offered only to admins — an operator's route is their own station's, set on the server. */
  routes: { value: string; text: string }[] | null;
  labels: {
    route: string;
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
      {routes && (
        <label className="block">
          <span className="text-muted mb-1.5 block text-xs font-medium">{labels.route}</span>
          <select name="route" required defaultValue={routes[0]?.value} className="field">
            {routes.map((r) => (
              <option key={r.value} value={r.value}>
                {r.text}
              </option>
            ))}
          </select>
        </label>
      )}

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

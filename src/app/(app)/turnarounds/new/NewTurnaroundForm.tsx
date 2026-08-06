"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { createTurnaround } from "@/actions/turnaround";

export default function NewTurnaroundForm({
  trains,
  today,
  labels,
}: {
  trains: { id: number; text: string }[];
  today: string;
  labels: { trainNumber: string; cycleDate: string; submit: string; alreadyExists: string; generic: string };
}) {
  const [state, action, pending] = useActionState(createTurnaround, undefined);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.push("/turnarounds");
  }, [state, router]);

  return (
    <form action={action} className="card space-y-4 p-6">
      <label className="block">
        <span className="text-muted mb-1.5 block text-xs font-medium">{labels.trainNumber}</span>
        <select name="trainNumberId" required defaultValue="" className="field">
          <option value="" disabled>
            —
          </option>
          {trains.map((n) => (
            <option key={n.id} value={n.id}>
              {n.text}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-muted mb-1.5 block text-xs font-medium">{labels.cycleDate}</span>
        <input type="date" name="cycleDate" required defaultValue={today} className="field" />
      </label>

      {state?.ok === false && (
        <p role="alert" className="text-danger text-xs">
          {state.error === "alreadyExists" ? labels.alreadyExists : labels.generic}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {labels.submit}
      </button>
    </form>
  );
}

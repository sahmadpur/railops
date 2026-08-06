"use client";

import { useActionState } from "react";

import { createTurnaround } from "@/actions/turnaround";
import SearchSelect from "@/components/SearchSelect";

export default function NewTurnaroundForm({
  trains,
  today,
  labels,
}: {
  trains: { id: number; text: string }[];
  today: string;
  labels: {
    trainNumber: string;
    cycleDate: string;
    submit: string;
    search: string;
    noTrainMatch: string;
    alreadyExists: string;
    trainBusy: string;
    generic: string;
  };
}) {
  const [state, action, pending] = useActionState(createTurnaround, undefined);
  // A successful create redirects from the server, so there is nothing to do on ok here.

  return (
    <form action={action} className="card space-y-4 p-6">
      <label className="block">
        <span className="text-muted mb-1.5 block text-xs font-medium">{labels.trainNumber}</span>
        <SearchSelect
          name="trainNumberId"
          options={trains}
          placeholder={labels.search}
          ariaLabel={labels.trainNumber}
          required
          noMatchText={labels.noTrainMatch}
          className="field"
        />
      </label>

      <label className="block">
        <span className="text-muted mb-1.5 block text-xs font-medium">{labels.cycleDate}</span>
        <input type="date" name="cycleDate" required defaultValue={today} className="field" />
      </label>

      {state?.ok === false && (
        <p role="alert" className="text-danger text-xs">
          {state.error === "alreadyExists"
            ? labels.alreadyExists
            : state.error === "trainBusy"
              ? labels.trainBusy
              : labels.generic}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {labels.submit}
      </button>
    </form>
  );
}

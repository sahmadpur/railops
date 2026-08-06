"use client";

import { useActionState, useState } from "react";

import { createTurnaround } from "@/actions/turnaround";

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
  const [query, setQuery] = useState("");

  // One field that filters as you type: the browser's own datalist popup does the searching,
  // and the picked label is mapped back to its id for the form.
  const idByText = new Map(trains.map((n) => [n.text, n.id]));
  const selectedId = idByText.get(query.trim()) ?? "";
  const unmatched = query.trim() !== "" && selectedId === "";

  return (
    <form action={action} className="card space-y-4 p-6">
      <label className="block">
        <span className="text-muted mb-1.5 block text-xs font-medium">{labels.trainNumber}</span>
        <input
          list="train-numbers"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.search}
          autoComplete="off"
          required
          className="field"
        />
        <datalist id="train-numbers">
          {trains.map((n) => (
            <option key={n.id} value={n.text} />
          ))}
        </datalist>
        <input type="hidden" name="trainNumberId" value={selectedId} />
        {unmatched && (
          <span role="alert" className="text-danger mt-1 block text-xs">
            {labels.noTrainMatch}
          </span>
        )}
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

      <button type="submit" disabled={pending || selectedId === ""} className="btn btn-primary">
        {labels.submit}
      </button>
    </form>
  );
}

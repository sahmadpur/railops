"use client";

import { useActionState } from "react";

import { closeTurnaround, reopenTurnaround, type ActionResult } from "@/actions/turnaround";

type Labels = {
  close: string;
  reopen: string;
  closed: string;
  missing: string;
  success: string;
  generic: string;
  forbidden: string;
};

export default function CloseControls({
  turnaroundId,
  isAdmin,
  isClosed,
  missingCount,
  labels,
}: {
  turnaroundId: number;
  isAdmin: boolean;
  isClosed: boolean;
  missingCount: number;
  labels: Labels;
}) {
  const [closeState, close, closing] = useActionState(closeTurnaround, undefined);
  const [reopenState, reopen, reopening] = useActionState(reopenTurnaround, undefined);
  const state: ActionResult | undefined = closeState ?? reopenState;

  if (!isAdmin) {
    return (
      <div className="text-xs">
        {isClosed ? (
          <span className="badge badge-success">{labels.closed}</span>
        ) : (
          missingCount > 0 && <span className="badge badge-warning">{labels.missing}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      {isClosed ? (
        <form action={reopen}>
          <input type="hidden" name="turnaroundId" value={turnaroundId} />
          <button type="submit" disabled={reopening} className="btn">
            {labels.reopen}
          </button>
        </form>
      ) : (
        <form action={close}>
          <input type="hidden" name="turnaroundId" value={turnaroundId} />
          <button type="submit" disabled={closing || missingCount > 0} className="btn btn-primary">
            {labels.close}
          </button>
        </form>
      )}

      {isClosed && <span className="badge badge-success">{labels.closed}</span>}
      {!isClosed && missingCount > 0 && <span className="text-warning max-w-[260px] text-end">{labels.missing}</span>}
      {state?.ok === true && <span className="text-success">{labels.success}</span>}
      {state?.ok === false && (
        <span className="text-danger">
          {state.error === "missingOperations" ? labels.missing : state.error === "forbidden" ? labels.forbidden : labels.generic}
        </span>
      )}
    </div>
  );
}

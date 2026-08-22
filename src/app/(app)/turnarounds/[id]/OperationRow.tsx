"use client";

import { useActionState } from "react";

import type { OperationField } from "@/db/schema";
import { clearOperation, saveOperation, type ActionResult } from "@/actions/turnaround";
import SearchSelect from "@/components/SearchSelect";
import { toLocalInputValue } from "@/lib/format";

export type Option = { id: number | string; text: string };

export type RowLabels = {
  save: string;
  saving: string;
  clear: string;
  saved: string;
  readOnly: string;
  fieldNames: Record<OperationField, string>;
  /** Ordering key -> the number the sheet prints, for errors that name another operation. */
  displayNos: Record<number, string>;
  /** Pre-rendered error text keyed by rule code — the server returns codes, not sentences. */
  errors: Record<string, string>;
};

export type RowData = {
  turnaroundId: number;
  operationTypeId: number;
  seq: number;
  /** `seq` as the sheet prints it — what the operator reads. */
  no: string;
  name: string;
  stationName: string;
  obligationText: string;
  obligation: "required" | "optional" | "conditional";
  fields: OperationField[];
  editable: boolean;
  /** True once the step has a row in the database, as opposed to merely being open for entry. */
  recorded: boolean;
  occurredAtValue: string;
  trainNumber: string | null;
  locomotiveId: number | null;
  detachReasonCode: string | null;
  maintenanceReasonCode: string | null;
  maintenanceTypeCode: string | null;
  note: string | null;
  recordedByName: string | null;
  options: {
    locomotive: Option[];
    detach_reason: Option[];
    maintenance_reason: Option[];
    maintenance_type: Option[];
  };
};

const FIELD_TO_INPUT: Record<OperationField, string> = {
  train_number: "trainNumber",
  locomotive: "locomotiveId",
  detach_reason: "detachReasonCode",
  maintenance_reason: "maintenanceReasonCode",
  maintenance_type: "maintenanceTypeCode",
};

function currentValue(row: RowData, field: OperationField): string {
  switch (field) {
    case "train_number":
      return row.trainNumber ?? "";
    case "locomotive":
      return row.locomotiveId?.toString() ?? "";
    case "detach_reason":
      return row.detachReasonCode ?? "";
    case "maintenance_reason":
      return row.maintenanceReasonCode ?? "";
    case "maintenance_type":
      return row.maintenanceTypeCode ?? "";
  }
}

function message(result: ActionResult | undefined, labels: RowLabels): { text: string; ok: boolean } | null {
  if (!result) return null;
  if (result.ok) return { text: labels.saved, ok: true };

  const template = labels.errors[result.error] ?? labels.errors.generic;
  const text = template
    .replace("{seq}", result.seq === undefined ? "" : (labels.displayNos[result.seq] ?? String(result.seq)))
    .replace("{field}", result.field ? labels.fieldNames[result.field as OperationField] : "");
  return { text, ok: false };
}

export default function OperationRow({
  row,
  labels,
  newStationGroup = false,
}: {
  row: RowData;
  labels: RowLabels;
  newStationGroup?: boolean;
}) {
  const [saveState, save, saving] = useActionState(saveOperation, undefined);
  const [clearState, clear, clearing] = useActionState(clearOperation, undefined);
  const feedback = message(saveState, labels) ?? message(clearState, labels);

  // The operator never types a time: an empty field is stamped with the current moment the
  // first time it is touched, and `saveOperation` stamps it server-side if the form is
  // submitted while still blank. Filling on focus rather than on mount keeps an unrecorded
  // step visibly empty, so it cannot be mistaken for one that is already saved.
  const stampNow = (event: React.FocusEvent<HTMLInputElement>) => {
    if (!event.target.value) event.target.value = toLocalInputValue(new Date());
  };

  const obligationTone =
    row.obligation === "required" ? "text-muted" : row.obligation === "conditional" ? "text-warning" : "text-faint";

  return (
    <tr
      className={[
        row.editable ? "" : "bg-surface-muted",
        // The route hands over to the next station here.
        newStationGroup ? "border-t-2 border-t-[color:var(--accent)]" : "",
      ].join(" ")}
    >
      <td className="text-faint text-center tabular-nums">{row.no}</td>
      <td>
        <div className="flex items-center gap-1.5">
          {/* A recorded step is marked, so it never reads as one that is merely open for entry. */}
          {row.recorded && (
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-success shrink-0"
              role="img"
              aria-label={labels.saved}
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
          )}
          <span className="font-medium">{row.name}</span>
        </div>
        <div className={`text-[11px] ${obligationTone}`}>{row.obligationText}</div>
      </td>
      <td className="text-muted whitespace-nowrap text-xs">{row.stationName}</td>

      <td>
        {/* React resets an uncontrolled form once its action resolves, and a reset restores the
            defaults the inputs mounted with — the pre-save ones. Keying the form on the saved
            values remounts just the inputs against the revalidated data, while the row itself
            stays mounted so the action result survives to be shown. */}
        <form
          key={[
            row.occurredAtValue,
            row.trainNumber,
            row.locomotiveId,
            row.detachReasonCode,
            row.maintenanceReasonCode,
            row.maintenanceTypeCode,
            row.note,
          ].join("|")}
          action={save}
          id={`save-${row.operationTypeId}`}
          className="flex flex-wrap items-center gap-1"
        >
          <input type="hidden" name="turnaroundId" value={row.turnaroundId} />
          <input type="hidden" name="operationTypeId" value={row.operationTypeId} />
          <input
            type="datetime-local"
            name="occurredAt"
            defaultValue={row.occurredAtValue}
            disabled={!row.editable}
            onFocus={stampNow}
            className="field w-[190px]"
          />

          {row.fields.map((field) =>
            field === "train_number" ? (
              <input
                key={field}
                type="text"
                name={FIELD_TO_INPUT[field]}
                defaultValue={currentValue(row, field)}
                placeholder={labels.fieldNames[field]}
                aria-label={labels.fieldNames[field]}
                disabled={!row.editable}
                autoComplete="off"
                inputMode="numeric"
                className="field w-[110px]"
              />
            ) : field === "locomotive" ? (
              <SearchSelect
                key={field}
                name={FIELD_TO_INPUT[field]}
                options={row.options[field]}
                defaultId={currentValue(row, field)}
                placeholder={labels.fieldNames[field]}
                disabled={!row.editable}
              />
            ) : (
              <select
                key={field}
                name={FIELD_TO_INPUT[field]}
                defaultValue={currentValue(row, field)}
                disabled={!row.editable}
                aria-label={labels.fieldNames[field]}
                className="field w-auto min-w-[130px]"
              >
                <option value="">{labels.fieldNames[field]}</option>
                {row.options[field].map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.text}
                  </option>
                ))}
              </select>
            ),
          )}
        </form>
      </td>

      <td>
        {/* Lives outside the <form> element but submits with it via the form attribute —
            the same trick RowForm documents. */}
        <input
          type="text"
          name="note"
          form={`save-${row.operationTypeId}`}
          defaultValue={row.note ?? ""}
          key={row.note ?? ""}
          disabled={!row.editable}
          placeholder="…"
          className="field w-[140px]"
        />
      </td>

      <td className="whitespace-nowrap">
        {row.editable && (
          <>
            <div className="flex items-center gap-1">
              <button type="submit" form={`save-${row.operationTypeId}`} disabled={saving} className="btn btn-primary px-2 py-1 text-xs">
                {saving ? labels.saving : labels.save}
              </button>
              {row.recorded && (
                <form action={clear}>
                  <input type="hidden" name="turnaroundId" value={row.turnaroundId} />
                  <input type="hidden" name="operationTypeId" value={row.operationTypeId} />
                  <button type="submit" disabled={clearing} className="btn px-2 py-1 text-xs">
                    {labels.clear}
                  </button>
                </form>
              )}
            </div>
            {feedback && (
              <div
                role="status"
                className={`mt-1 text-[11px] ${feedback.ok ? "text-success" : "text-danger"}`}
              >
                {feedback.text}
              </div>
            )}
          </>
        )}
      </td>

      <td className="text-muted text-[11px]">
        {row.editable ? (
          (row.recordedByName ?? "")
        ) : (
          <span title={labels.readOnly}>{row.recordedByName ?? labels.readOnly}</span>
        )}
      </td>
    </tr>
  );
}

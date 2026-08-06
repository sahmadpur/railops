"use client";

import { useActionState } from "react";

import type { OperationField } from "@/db/schema";
import { clearOperation, saveOperation, type ActionResult } from "@/actions/turnaround";

export type Option = { id: number | string; text: string };

export type RowLabels = {
  save: string;
  clear: string;
  saved: string;
  readOnly: string;
  fieldNames: Record<OperationField, string>;
  /** Pre-rendered error text keyed by rule code — the server returns codes, not sentences. */
  errors: Record<string, string>;
};

export type RowData = {
  turnaroundId: number;
  operationTypeId: number;
  seq: number;
  name: string;
  stationName: string;
  obligationText: string;
  obligation: "required" | "optional" | "conditional";
  fields: OperationField[];
  editable: boolean;
  occurredAtValue: string;
  trainNumberId: number | null;
  locomotiveId: number | null;
  detachReasonCode: string | null;
  maintenanceReasonCode: string | null;
  maintenanceTypeCode: string | null;
  note: string | null;
  recordedByName: string | null;
  options: {
    train_number: Option[];
    locomotive: Option[];
    detach_reason: Option[];
    maintenance_reason: Option[];
    maintenance_type: Option[];
  };
};

const FIELD_TO_INPUT: Record<OperationField, string> = {
  train_number: "trainNumberId",
  locomotive: "locomotiveId",
  detach_reason: "detachReasonCode",
  maintenance_reason: "maintenanceReasonCode",
  maintenance_type: "maintenanceTypeCode",
};

function currentValue(row: RowData, field: OperationField): string {
  switch (field) {
    case "train_number":
      return row.trainNumberId?.toString() ?? "";
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
    .replace("{seq}", String(result.seq ?? ""))
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
      <td className="text-faint text-center tabular-nums">{row.seq}</td>
      <td>
        <div className="font-medium">{row.name}</div>
        <div className={`text-[11px] ${obligationTone}`}>{row.obligationText}</div>
      </td>
      <td className="text-muted whitespace-nowrap text-xs">{row.stationName}</td>

      <td colSpan={row.editable ? 1 : 2}>
        <form action={save} id={`save-${row.operationTypeId}`} className="flex flex-wrap items-center gap-1">
          <input type="hidden" name="turnaroundId" value={row.turnaroundId} />
          <input type="hidden" name="operationTypeId" value={row.operationTypeId} />
          <input
            type="datetime-local"
            name="occurredAt"
            defaultValue={row.occurredAtValue}
            disabled={!row.editable}
            required
            className="field w-[190px]"
          />

          {row.fields.map((field) => (
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
          ))}

          <input
            type="text"
            name="note"
            defaultValue={row.note ?? ""}
            disabled={!row.editable}
            placeholder="…"
            className="field w-[120px]"
          />
        </form>
      </td>

      {row.editable && (
        <td className="whitespace-nowrap">
          <div className="flex items-center gap-1">
            <button type="submit" form={`save-${row.operationTypeId}`} disabled={saving} className="btn btn-primary px-2 py-1 text-xs">
              {labels.save}
            </button>
            {row.occurredAtValue && (
              <form action={clear}>
                <input type="hidden" name="turnaroundId" value={row.turnaroundId} />
                <input type="hidden" name="operationTypeId" value={row.operationTypeId} />
                <button type="submit" disabled={clearing} className="btn px-2 py-1 text-xs">
                  {labels.clear}
                </button>
              </form>
            )}
          </div>
        </td>
      )}

      <td className="text-muted text-[11px]">
        {feedback ? (
          <span className={feedback.ok ? "text-success" : "text-danger"}>{feedback.text}</span>
        ) : row.editable ? (
          (row.recordedByName ?? "")
        ) : (
          <span title={labels.readOnly}>{row.recordedByName ?? labels.readOnly}</span>
        )}
      </td>
    </tr>
  );
}

/**
 * Every rule the spreadsheet enforced by convention, made explicit.
 * Pure functions only — no DB, no request context — so they are cheap to test and
 * usable from both the write path (src/actions/turnaround.ts) and the read path
 * (the detail page, which greys out what the current user may not touch).
 */
import type { OperationField } from "@/db/schema";

export type OperationTypeLike = {
  id: number;
  seq: number;
  stationId: number;
  obligation: "required" | "optional" | "conditional";
  conditionalOnSeq: number | null;
  parallelWithSeq: number | null;
  fields: OperationField[];
  isActive: boolean;
};

export type EntryLike = {
  operationTypeId: number;
  occurredAt: Date;
};

export type ActorLike = {
  role: "admin" | "operator";
  stationId: number | null;
};

export type EntryInput = {
  occurredAt: Date;
  trainNumberId?: number | null;
  locomotiveId?: number | null;
  detachReasonCode?: string | null;
  maintenanceReasonCode?: string | null;
  maintenanceTypeCode?: string | null;
};

/** Which input each declared field requires. */
const FIELD_INPUT: Record<OperationField, keyof EntryInput> = {
  train_number: "trainNumberId",
  locomotive: "locomotiveId",
  detach_reason: "detachReasonCode",
  maintenance_reason: "maintenanceReasonCode",
  maintenance_type: "maintenanceTypeCode",
};

export type RuleError = { code: string; seq?: number; field?: string };

/** An operator may only record operations that happen at their own station. Admins are unrestricted. */
export function canEdit(actor: ActorLike, operation: OperationTypeLike): boolean {
  if (actor.role === "admin") return true;
  return actor.stationId !== null && actor.stationId === operation.stationId;
}

/**
 * Operations that run simultaneously are exempt from ordering against each other.
 * The link is declared on one side only, so treat it as symmetric.
 */
export function areParallel(a: OperationTypeLike, b: OperationTypeLike): boolean {
  return a.parallelWithSeq === b.seq || b.parallelWithSeq === a.seq;
}

/**
 * `occurredAt` may not precede any already-recorded earlier operation, except one it runs
 * in parallel with. Later operations are checked too — editing step 5 must not jump past step 6.
 */
export function checkChronology(
  operation: OperationTypeLike,
  occurredAt: Date,
  catalogue: OperationTypeLike[],
  entries: EntryLike[],
): RuleError | null {
  const bySeq = new Map(catalogue.map((o) => [o.id, o]));

  for (const entry of entries) {
    const other = bySeq.get(entry.operationTypeId);
    if (!other || other.id === operation.id) continue;
    if (areParallel(operation, other)) continue;

    if (other.seq < operation.seq && entry.occurredAt.getTime() > occurredAt.getTime()) {
      return { code: "before_earlier_operation", seq: other.seq };
    }
    if (other.seq > operation.seq && entry.occurredAt.getTime() < occurredAt.getTime()) {
      return { code: "after_later_operation", seq: other.seq };
    }
  }
  return null;
}

/** Every field the operation declares must be supplied. */
export function checkRequiredFields(operation: OperationTypeLike, input: EntryInput): RuleError | null {
  for (const field of operation.fields) {
    const value = input[FIELD_INPUT[field]];
    if (value === undefined || value === null || value === "") {
      return { code: "missing_field", seq: operation.seq, field };
    }
  }
  return null;
}

/** Full validation of one write. Returns null when the entry may be saved. */
export function validateEntry(
  actor: ActorLike,
  operation: OperationTypeLike,
  input: EntryInput,
  catalogue: OperationTypeLike[],
  entries: EntryLike[],
): RuleError | null {
  if (!operation.isActive) return { code: "operation_inactive", seq: operation.seq };
  if (!canEdit(actor, operation)) return { code: "wrong_station", seq: operation.seq };
  if (Number.isNaN(input.occurredAt.getTime())) return { code: "invalid_timestamp", seq: operation.seq };

  return (
    checkRequiredFields(operation, input) ??
    checkChronology(operation, input.occurredAt, catalogue, entries)
  );
}

/**
 * Which operations still block closing the turnaround: all `required` ones, plus each
 * `conditional` one whose trigger operation has been recorded.
 */
export function missingForClose(catalogue: OperationTypeLike[], entries: EntryLike[]): OperationTypeLike[] {
  const filledIds = new Set(entries.map((e) => e.operationTypeId));
  const seqById = new Map(catalogue.map((o) => [o.id, o.seq]));
  const filledSeqs = new Set([...filledIds].map((id) => seqById.get(id)).filter((s): s is number => s !== undefined));

  return catalogue.filter((o) => {
    if (!o.isActive || filledIds.has(o.id)) return false;
    if (o.obligation === "required") return true;
    if (o.obligation === "conditional") return o.conditionalOnSeq !== null && filledSeqs.has(o.conditionalOnSeq);
    return false;
  });
}

/** Elapsed turnaround time in minutes — the spreadsheet's "Общее затраченное время" row. */
export function elapsedMinutes(entries: EntryLike[]): number | null {
  if (entries.length < 2) return null;
  const times = entries.map((e) => e.occurredAt.getTime());
  return Math.round((Math.max(...times) - Math.min(...times)) / 60000);
}

export function formatElapsed(minutes: number | null): string {
  if (minutes === null) return "—";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

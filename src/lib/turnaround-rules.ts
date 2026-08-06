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

/**
 * A turnaround is off the road once it reaches one of these; anything else still occupies its
 * train, so that train cannot start another turnaround.
 */
export const FINISHED_STATUSES = ["completed", "cancelled"] as const;

/** An operator may only record operations that happen at their own station. Admins are unrestricted. */
export function canEdit(actor: ActorLike, operation: OperationTypeLike): boolean {
  if (actor.role === "admin") return true;
  return actor.stationId !== null && actor.stationId === operation.stationId;
}

/**
 * Which train parity a station may open a turnaround with: Böyük Kəsik starts the outbound leg
 * with an even train, Tbilisi the return leg with an odd one. Gardabani never opens a turnaround,
 * and neither does an operator without a station.
 */
const OPENING_PARITY = { BK: "even", TBS: "odd" } as const;

/** `parity: null` means every parity is allowed — admins only. */
export type Opening = { allowed: false } | { allowed: true; parity: "even" | "odd" | null };

export function openingRule(role: ActorLike["role"], stationCode: string | null): Opening {
  if (role === "admin") return { allowed: true, parity: null };
  const parity = stationCode ? OPENING_PARITY[stationCode as keyof typeof OPENING_PARITY] : undefined;
  return parity ? { allowed: true, parity } : { allowed: false };
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

/**
 * The turnaround is filled in order: nothing past the first unfilled mandatory step may be
 * recorded yet. An unfilled *optional* step never wedges the sequence — it stays open while
 * the steps after it proceed — and a step that runs parallel to the blocker opens with it.
 * Already-recorded steps stay editable wherever they sit.
 */
export function unlockedIds(catalogue: OperationTypeLike[], entries: EntryLike[]): Set<number> {
  const filled = new Set(entries.map((e) => e.operationTypeId));
  const blocker = missingForClose(catalogue, entries).sort((a, b) => a.seq - b.seq)[0];

  return new Set(
    catalogue
      .filter((o) => !blocker || o.seq <= blocker.seq || areParallel(o, blocker) || filled.has(o.id))
      .map((o) => o.id),
  );
}

/** Guards the write path against a replayed form for a step that is not open yet. */
export function checkUnlocked(
  operation: OperationTypeLike,
  catalogue: OperationTypeLike[],
  entries: EntryLike[],
): RuleError | null {
  return unlockedIds(catalogue, entries).has(operation.id)
    ? null
    : { code: "locked_operation", seq: operation.seq };
}

/**
 * Clearing a step in the middle would punch a hole in the sequence and hide everything after
 * it, so only the newest recorded step may be cleared. Admins are exempt.
 */
export function checkClearable(
  actor: ActorLike,
  operation: OperationTypeLike,
  catalogue: OperationTypeLike[],
  entries: EntryLike[],
): RuleError | null {
  if (actor.role === "admin") return null;
  const seqById = new Map(catalogue.map((o) => [o.id, o.seq]));
  const later = entries.find((e) => (seqById.get(e.operationTypeId) ?? 0) > operation.seq);
  return later ? { code: "clear_later_first", seq: seqById.get(later.operationTypeId) } : null;
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

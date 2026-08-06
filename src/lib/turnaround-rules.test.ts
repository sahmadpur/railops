import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canEdit,
  checkClearable,
  checkUnlocked,
  elapsedMinutes,
  formatElapsed,
  missingForClose,
  openingRule,
  unlockedIds,
  validateEntry,
  type EntryLike,
  type OperationTypeLike,
} from "./turnaround-rules";

const BK = 1;
const GRD = 2;

function op(partial: Partial<OperationTypeLike> & { id: number; seq: number }): OperationTypeLike {
  return {
    stationId: BK,
    obligation: "required",
    conditionalOnSeq: null,
    parallelWithSeq: null,
    fields: [],
    isActive: true,
    ...partial,
  };
}

// Miniature catalogue mirroring the real shape: a parallel pair, an optional step,
// and a conditional step that only matters once its trigger is filled.
const catalogue: OperationTypeLike[] = [
  op({ id: 10, seq: 1 }),
  op({ id: 20, seq: 2 }),
  op({ id: 30, seq: 3, parallelWithSeq: 2 }),
  op({ id: 40, seq: 4, stationId: GRD }),
  op({ id: 50, seq: 5, obligation: "optional", stationId: GRD, fields: ["maintenance_reason"] }),
  op({ id: 60, seq: 6, obligation: "conditional", conditionalOnSeq: 5, stationId: GRD }),
];

const admin = { role: "admin" as const, stationId: null };
const bkOperator = { role: "operator" as const, stationId: BK };
const grdOperator = { role: "operator" as const, stationId: GRD };

const at = (iso: string) => new Date(iso);

test("operator may only write operations at their own station", () => {
  assert.equal(canEdit(bkOperator, catalogue[0]), true);
  assert.equal(canEdit(bkOperator, catalogue[3]), false);
  assert.equal(canEdit(admin, catalogue[3]), true);

  const error = validateEntry(bkOperator, catalogue[3], { occurredAt: at("2026-08-06T10:00:00Z") }, catalogue, []);
  assert.equal(error?.code, "wrong_station");
});

test("only Böyük Kəsik and Tbilisi open turnarounds, each with its own parity", () => {
  assert.deepEqual(openingRule("operator", "BK"), { allowed: true, parity: "even" });
  assert.deepEqual(openingRule("operator", "TBS"), { allowed: true, parity: "odd" });
  assert.deepEqual(openingRule("operator", "GRD"), { allowed: false });
  assert.deepEqual(openingRule("operator", "ZZZ"), { allowed: false });
  assert.deepEqual(openingRule("operator", null), { allowed: false });
  // Admins have no station and are never blocked.
  assert.deepEqual(openingRule("admin", null), { allowed: true, parity: null });
});

test("an operation cannot be timed before an earlier recorded operation", () => {
  const entries: EntryLike[] = [{ operationTypeId: 10, occurredAt: at("2026-08-06T10:00:00Z") }];
  const error = validateEntry(bkOperator, catalogue[1], { occurredAt: at("2026-08-06T09:00:00Z") }, catalogue, entries);
  assert.equal(error?.code, "before_earlier_operation");
  assert.equal(error?.seq, 1);
});

test("an operation cannot be timed after a later recorded operation", () => {
  const entries: EntryLike[] = [{ operationTypeId: 40, occurredAt: at("2026-08-06T10:00:00Z") }];
  const error = validateEntry(bkOperator, catalogue[1], { occurredAt: at("2026-08-06T11:00:00Z") }, catalogue, entries);
  assert.equal(error?.code, "after_later_operation");
  assert.equal(error?.seq, 4);
});

test("parallel operations are exempt from ordering against each other", () => {
  // seq 3 declares parallelWithSeq 2, so it may be timed before seq 2.
  const entries: EntryLike[] = [{ operationTypeId: 20, occurredAt: at("2026-08-06T10:30:00Z") }];
  const error = validateEntry(bkOperator, catalogue[2], { occurredAt: at("2026-08-06T10:00:00Z") }, catalogue, entries);
  assert.equal(error, null);

  // ...but the exemption is only against its pair, not against everything earlier.
  const withSeq1: EntryLike[] = [{ operationTypeId: 10, occurredAt: at("2026-08-06T11:00:00Z") }];
  const stillFails = validateEntry(
    bkOperator,
    catalogue[2],
    { occurredAt: at("2026-08-06T10:00:00Z") },
    catalogue,
    withSeq1,
  );
  assert.equal(stillFails?.code, "before_earlier_operation");
});

test("declared extra fields are mandatory", () => {
  const missing = validateEntry(grdOperator, catalogue[4], { occurredAt: at("2026-08-06T12:00:00Z") }, catalogue, []);
  assert.equal(missing?.code, "missing_field");
  assert.equal(missing?.field, "maintenance_reason");

  const supplied = validateEntry(
    grdOperator,
    catalogue[4],
    { occurredAt: at("2026-08-06T12:00:00Z"), maintenanceReasonCode: "scheduled" },
    catalogue,
    [],
  );
  assert.equal(supplied, null);
});

test("close is blocked while a required operation is unfilled", () => {
  const entries: EntryLike[] = [
    { operationTypeId: 10, occurredAt: at("2026-08-06T10:00:00Z") },
    { operationTypeId: 20, occurredAt: at("2026-08-06T10:10:00Z") },
    { operationTypeId: 30, occurredAt: at("2026-08-06T10:10:00Z") },
  ];
  assert.deepEqual(
    missingForClose(catalogue, entries).map((o) => o.seq),
    [4],
  );
});

test("a conditional operation is required only once its trigger is filled", () => {
  const required: EntryLike[] = [
    { operationTypeId: 10, occurredAt: at("2026-08-06T10:00:00Z") },
    { operationTypeId: 20, occurredAt: at("2026-08-06T10:10:00Z") },
    { operationTypeId: 30, occurredAt: at("2026-08-06T10:10:00Z") },
    { operationTypeId: 40, occurredAt: at("2026-08-06T12:00:00Z") },
  ];
  // Optional seq 5 untouched -> conditional seq 6 does not block the close.
  assert.deepEqual(missingForClose(catalogue, required), []);

  // Fill seq 5 (sent to maintenance) and seq 6 (returned) becomes mandatory.
  const withTrigger = [...required, { operationTypeId: 50, occurredAt: at("2026-08-06T13:00:00Z") }];
  assert.deepEqual(
    missingForClose(catalogue, withTrigger).map((o) => o.seq),
    [6],
  );
});

test("inactive operations neither block a close nor accept writes", () => {
  const withInactive = catalogue.map((o) => (o.seq === 4 ? { ...o, isActive: false } : o));
  assert.deepEqual(missingForClose(withInactive, []).map((o) => o.seq), [1, 2, 3]);

  const error = validateEntry(
    admin,
    { ...catalogue[3], isActive: false },
    { occurredAt: at("2026-08-06T10:00:00Z") },
    catalogue,
    [],
  );
  assert.equal(error?.code, "operation_inactive");
});

const unlockedSeqs = (entries: EntryLike[]) =>
  catalogue.filter((o) => unlockedIds(catalogue, entries).has(o.id)).map((o) => o.seq);

test("only the next unfilled step is open, and everything after it is locked", () => {
  // Nothing recorded: seq 1 is the blocker, so seq 1 is the only step open.
  assert.deepEqual(unlockedSeqs([]), [1]);
  assert.equal(checkUnlocked(catalogue[3], catalogue, [])?.code, "locked_operation");

  const first: EntryLike[] = [{ operationTypeId: 10, occurredAt: at("2026-08-06T10:00:00Z") }];
  assert.deepEqual(unlockedSeqs(first), [1, 2, 3]); // seq 3 runs parallel to the blocker seq 2
  assert.equal(checkUnlocked(catalogue[2], catalogue, first), null);
  assert.equal(checkUnlocked(catalogue[3], catalogue, first)?.code, "locked_operation");
});

test("an unfilled optional step does not wedge the sequence", () => {
  const throughSeq4: EntryLike[] = [
    { operationTypeId: 10, occurredAt: at("2026-08-06T10:00:00Z") },
    { operationTypeId: 20, occurredAt: at("2026-08-06T10:10:00Z") },
    { operationTypeId: 30, occurredAt: at("2026-08-06T10:10:00Z") },
    { operationTypeId: 40, occurredAt: at("2026-08-06T12:00:00Z") },
  ];
  // Optional seq 5 is skipped and its conditional seq 6 is not triggered, so nothing is
  // mandatory any more — the whole catalogue stays open.
  assert.deepEqual(unlockedSeqs(throughSeq4), [1, 2, 3, 4, 5, 6]);

  // Fill the optional step and its conditional partner becomes the blocker, not a lock.
  const withTrigger = [...throughSeq4, { operationTypeId: 50, occurredAt: at("2026-08-06T13:00:00Z") }];
  assert.deepEqual(unlockedSeqs(withTrigger), [1, 2, 3, 4, 5, 6]);
});

test("a recorded step stays open even when an earlier one is cleared", () => {
  // seq 4 was filled, then seq 2 cleared: seq 2 blocks, but seq 4 is still editable.
  const withHole: EntryLike[] = [
    { operationTypeId: 10, occurredAt: at("2026-08-06T10:00:00Z") },
    { operationTypeId: 40, occurredAt: at("2026-08-06T12:00:00Z") },
  ];
  assert.deepEqual(unlockedSeqs(withHole), [1, 2, 3, 4]);
});

test("only the newest step may be cleared, and admins are exempt", () => {
  const entries: EntryLike[] = [
    { operationTypeId: 10, occurredAt: at("2026-08-06T10:00:00Z") },
    { operationTypeId: 20, occurredAt: at("2026-08-06T10:10:00Z") },
  ];
  assert.equal(checkClearable(bkOperator, catalogue[0], catalogue, entries)?.code, "clear_later_first");
  assert.equal(checkClearable(bkOperator, catalogue[1], catalogue, entries), null);
  assert.equal(checkClearable(admin, catalogue[0], catalogue, entries), null);
});

test("elapsed time spans first to last operation", () => {
  const entries: EntryLike[] = [
    { operationTypeId: 10, occurredAt: at("2026-08-06T22:00:00Z") },
    { operationTypeId: 40, occurredAt: at("2026-08-07T03:30:00Z") },
  ];
  assert.equal(elapsedMinutes(entries), 330);
  assert.equal(formatElapsed(330), "05:30");
  assert.equal(elapsedMinutes([entries[0]]), null);
  assert.equal(formatElapsed(null), "—");
});

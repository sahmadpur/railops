import assert from "node:assert/strict";
import { test } from "node:test";

import { operationStats, routeSegments, segmentStats, type Row } from "./timeline";

const BK = 1;
const GRD = 2;

// Route shape in miniature: out through BK, over to GRD, back to BK.
const catalogue = [
  { id: 10, seq: 1, stationId: BK, isActive: true },
  { id: 20, seq: 2, stationId: BK, isActive: true },
  { id: 30, seq: 3, stationId: GRD, isActive: true },
  { id: 40, seq: 4, stationId: GRD, isActive: true },
  { id: 50, seq: 5, stationId: BK, isActive: true },
  { id: 60, seq: 6, stationId: BK, isActive: false },
];

const at = (iso: string) => new Date(iso);
const row = (turnaroundId: number, operationTypeId: number, seq: number, iso: string): Row => ({
  turnaroundId,
  operationTypeId,
  seq,
  occurredAt: at(iso),
});

test("legs are cut wherever the station changes, and a second visit is a separate leg", () => {
  const segments = routeSegments(catalogue);
  assert.deepEqual(
    segments.map((s) => [s.stationId, s.fromSeq, s.toSeq, s.pass]),
    [
      [BK, 1, 2, 1],
      [GRD, 3, 4, 1],
      [BK, 5, 5, 2], // inactive seq 6 is left out entirely
    ],
  );
});

test("a leg's average spans its first to its last step, over turnarounds that recorded both", () => {
  const rows: Row[] = [
    row(1, 10, 1, "2026-08-06T10:00:00Z"),
    row(1, 20, 2, "2026-08-06T11:00:00Z"), // BK leg: 60 minutes
    row(1, 30, 3, "2026-08-06T13:00:00Z"),
    row(1, 40, 4, "2026-08-06T13:30:00Z"), // GRD leg: 30 minutes
    row(2, 10, 1, "2026-08-07T08:00:00Z"),
    row(2, 20, 2, "2026-08-07T10:00:00Z"), // BK leg: 120 minutes
    row(2, 30, 3, "2026-08-07T12:00:00Z"), // GRD leg: one step only, no span to measure
  ];

  const [bkOut, grdOut, bkBack] = segmentStats(routeSegments(catalogue), rows);
  assert.deepEqual([bkOut.avgMinutes, bkOut.turnarounds, bkOut.operations], [90, 2, 4]);
  assert.deepEqual([grdOut.avgMinutes, grdOut.turnarounds, grdOut.operations], [30, 1, 3]);
  // Nothing recorded on the return leg at all.
  assert.deepEqual([bkBack.avgMinutes, bkBack.turnarounds, bkBack.operations], [null, 0, 0]);
});

test("step time is the gap from the preceding recorded step of the same turnaround", () => {
  const rows: Row[] = [
    row(1, 10, 1, "2026-08-06T10:00:00Z"),
    row(1, 20, 2, "2026-08-06T10:20:00Z"),
    row(2, 10, 1, "2026-08-07T09:00:00Z"),
    row(2, 20, 2, "2026-08-07T09:40:00Z"),
  ];

  const [bkOut] = routeSegments(catalogue);
  assert.deepEqual(
    operationStats(bkOut, rows).map((o) => [o.seq, o.count, o.avgStepMinutes]),
    [
      [1, 2, null], // first step of the turnaround has nothing before it
      [2, 2, 30], // mean of 20 and 40
    ],
  );
});

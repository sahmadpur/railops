/**
 * Where a turnaround's time actually goes, per leg of the route.
 *
 * The legs are derived from the operation catalogue rather than stored: walking the sequence
 * and cutting wherever the station changes yields Böyük Kəsik → Gardabani → Tbilisi →
 * Gardabani → Böyük Kəsik on its own. Reordering the catalogue reshapes the timeline with no
 * code change, and the two passes through the same station stay separate.
 */
export type SegmentOperation = { id: number; seq: number };

export type Segment = {
  /** Position in the route — also the `?station=` value the dashboard links to. */
  index: number;
  stationId: number;
  fromSeq: number;
  toSeq: number;
  /** Which visit to this station this is: 1 for the first pass, 2 for the return. */
  pass: number;
  operations: SegmentOperation[];
};

/** One recorded operation, as the dashboard query returns it. */
export type Row = { turnaroundId: number; operationTypeId: number; seq: number; occurredAt: Date };

export type SegmentStats = {
  segment: Segment;
  /** Mean of (last − first) within the leg, over turnarounds that recorded at least two of its steps. */
  avgMinutes: number | null;
  turnarounds: number;
  operations: number;
};

export type OperationStats = {
  operationTypeId: number;
  seq: number;
  count: number;
  /** Mean gap from the preceding recorded step of the same turnaround. */
  avgStepMinutes: number | null;
};

type CatalogueRow = { id: number; seq: number; stationId: number; isActive: boolean };

export function routeSegments(catalogue: CatalogueRow[]): Segment[] {
  const ordered = catalogue.filter((o) => o.isActive).sort((a, b) => a.seq - b.seq);
  const segments: Segment[] = [];
  const passes = new Map<number, number>();

  for (const operation of ordered) {
    const current = segments.at(-1);
    if (current && current.stationId === operation.stationId) {
      current.toSeq = operation.seq;
      current.operations.push({ id: operation.id, seq: operation.seq });
      continue;
    }
    const pass = (passes.get(operation.stationId) ?? 0) + 1;
    passes.set(operation.stationId, pass);
    segments.push({
      index: segments.length,
      stationId: operation.stationId,
      fromSeq: operation.seq,
      toSeq: operation.seq,
      pass,
      operations: [{ id: operation.id, seq: operation.seq }],
    });
  }

  return segments;
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);

const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60000);

export function segmentStats(segments: Segment[], rows: Row[]): SegmentStats[] {
  const byTurnaround = groupByTurnaround(rows);

  return segments.map((segment) => {
    const ids = new Set(segment.operations.map((o) => o.id));
    const spans: number[] = [];
    let operations = 0;

    for (const entries of byTurnaround.values()) {
      const inSegment = entries.filter((e) => ids.has(e.operationTypeId));
      operations += inSegment.length;
      // A single recorded step has no span to measure — the same rule elapsedMinutes applies.
      if (inSegment.length < 2) continue;
      spans.push(minutesBetween(inSegment[0].occurredAt, inSegment.at(-1)!.occurredAt));
    }

    return { segment, avgMinutes: mean(spans), turnarounds: spans.length, operations };
  });
}

/**
 * Time on the move between two consecutive legs: from the last operation recorded at one
 * station to the first recorded at the next. One entry per gap, so `segments.length - 1`.
 */
export function transitStats(segments: Segment[], rows: Row[]): (number | null)[] {
  const byTurnaround = groupByTurnaround(rows);

  return segments.slice(0, -1).map((segment, index) => {
    const leaving = new Set(segment.operations.map((o) => o.id));
    const arriving = new Set(segments[index + 1].operations.map((o) => o.id));
    const gaps: number[] = [];

    for (const entries of byTurnaround.values()) {
      const departure = entries.filter((e) => leaving.has(e.operationTypeId)).at(-1);
      const arrival = entries.find((e) => arriving.has(e.operationTypeId));
      if (departure && arrival) gaps.push(minutesBetween(departure.occurredAt, arrival.occurredAt));
    }

    return mean(gaps);
  });
}

/** Per-operation detail for one leg: how often it was recorded and how long the step took. */
export function operationStats(segment: Segment, rows: Row[]): OperationStats[] {
  const byTurnaround = groupByTurnaround(rows);
  const gaps = new Map<number, number[]>();
  const counts = new Map<number, number>();

  for (const entries of byTurnaround.values()) {
    entries.forEach((entry, index) => {
      counts.set(entry.operationTypeId, (counts.get(entry.operationTypeId) ?? 0) + 1);
      const previous = entries[index - 1];
      if (!previous) return;
      const list = gaps.get(entry.operationTypeId) ?? [];
      list.push(minutesBetween(previous.occurredAt, entry.occurredAt));
      gaps.set(entry.operationTypeId, list);
    });
  }

  return segment.operations.map((operation) => ({
    operationTypeId: operation.id,
    seq: operation.seq,
    count: counts.get(operation.id) ?? 0,
    avgStepMinutes: mean(gaps.get(operation.id) ?? []),
  }));
}

function groupByTurnaround(rows: Row[]): Map<number, Row[]> {
  const grouped = new Map<number, Row[]>();
  for (const row of rows) {
    const list = grouped.get(row.turnaroundId);
    if (list) list.push(row);
    else grouped.set(row.turnaroundId, [row]);
  }
  // loadOperations orders by seq, but callers may pass rows from elsewhere.
  for (const list of grouped.values()) list.sort((a, b) => a.seq - b.seq);
  return grouped;
}

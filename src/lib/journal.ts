import { and, asc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { locomotives, operationTypes, trainNumbers, turnaroundOperations, turnarounds } from "@/db/schema";
import { formatTime, operationNo } from "@/lib/format";
import { elapsedMinutes, formatElapsed } from "@/lib/turnaround-rules";

/**
 * The monthly grid the paper journal uses: operations down the side, one column per
 * turnaround, hh:mm in the cells. Shared by the printable page and the Excel export
 * so the two can never drift.
 */
export type JournalColumn = {
  turnaroundId: number;
  cycleDate: string;
  trainNumber: string;
  /** Null until an attachment step records the locomotive. */
  locomotiveNumber: string | null;
  statusCode: string;
  /** operationTypeId -> hh:mm */
  times: Map<number, string>;
  elapsed: string;
};

export type Journal = {
  year: number;
  month: number;
  operations: { id: number; no: string; label: Record<string, string>; stationId: number }[];
  columns: JournalColumn[];
};

function monthBounds(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return { first: `${year}-${pad(month)}-01`, last: `${year}-${pad(month)}-${pad(lastDay)}` };
}

export async function buildJournal(year: number, month: number, locomotiveId?: number): Promise<Journal> {
  const { first, last } = monthBounds(year, month);

  const conditions = [gte(turnarounds.cycleDate, first), lte(turnarounds.cycleDate, last)];
  if (locomotiveId) conditions.push(eq(turnarounds.locomotiveId, locomotiveId));

  const [operations, columnRows] = await Promise.all([
    db.select().from(operationTypes).where(eq(operationTypes.isActive, true)).orderBy(asc(operationTypes.seq)),
    db
      .select({
        id: turnarounds.id,
        cycleDate: turnarounds.cycleDate,
        statusCode: turnarounds.statusCode,
        trainNumber: trainNumbers.number,
        locomotiveNumber: locomotives.number,
      })
      .from(turnarounds)
      .innerJoin(trainNumbers, eq(trainNumbers.id, turnarounds.trainNumberId))
      .leftJoin(locomotives, eq(locomotives.id, turnarounds.locomotiveId))
      .where(and(...conditions))
      .orderBy(asc(turnarounds.cycleDate), asc(turnarounds.id)),
  ]);

  const entries = columnRows.length
    ? await db
        .select()
        .from(turnaroundOperations)
        .where(
          and(
            gte(turnaroundOperations.occurredAt, new Date(`${first}T00:00:00`)),
            // Operations can spill past midnight into the following month; widen the window.
            lte(turnaroundOperations.occurredAt, new Date(`${last}T23:59:59`)),
          ),
        )
    : [];

  const byTurnaround = new Map<number, typeof entries>();
  for (const entry of entries) {
    const list = byTurnaround.get(entry.turnaroundId);
    if (list) list.push(entry);
    else byTurnaround.set(entry.turnaroundId, [entry]);
  }

  const columns: JournalColumn[] = columnRows.map((column) => {
    const rows = byTurnaround.get(column.id) ?? [];
    return {
      turnaroundId: column.id,
      cycleDate: column.cycleDate,
      trainNumber: column.trainNumber,
      locomotiveNumber: column.locomotiveNumber,
      statusCode: column.statusCode,
      times: new Map(rows.map((r) => [r.operationTypeId, formatTime(r.occurredAt)])),
      elapsed: formatElapsed(
        elapsedMinutes(rows.map((r) => ({ operationTypeId: r.operationTypeId, occurredAt: r.occurredAt }))),
      ),
    };
  });

  return {
    year,
    month,
    operations: operations.map((o) => ({ id: o.id, no: operationNo(o), label: o.label, stationId: o.stationId })),
    columns,
  };
}

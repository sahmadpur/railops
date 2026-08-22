/**
 * Demo turnaround history, for looking at the dashboard and the journal with something in them.
 * Never wired into a deploy — run it by hand: `npm run db:demo`.
 *
 * The rows are written straight to the tables rather than through src/actions/turnaround.ts, so
 * this script has to keep the invariants that action enforces by itself:
 *   - operations run in catalogue order, with the two parallel pairs (3‖2, 15‖14) exempt
 *   - every field an operation declares is filled
 *   - a `conditional` step appears only when its trigger did
 *   - each ТОИР send/return pair owns one maintenance_records row
 *   - a closed turnaround has every `required` step, so the app would let it close
 * The audit trail attributes the whole run to the admin; per-operation `recordedBy` still points
 * at the station operator, which is what the journal and the detail page show.
 *
 * Re-runnable: it deletes the turnarounds in its own date window first.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  locomotives,
  maintenanceRecords,
  operationTypes,
  stations,
  turnaroundOperations,
  turnarounds,
  users,
} from "./schema";

const FROM = process.env.DEMO_FROM ?? "2026-07-01";
const TO = process.env.DEMO_TO ?? isoDate(new Date());
/** Turnarounds opened per day. Three trains a day each way is the corridor's real order of magnitude. */
const PER_DAY = 3;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const client = postgres(url, { max: 1 });
const db = drizzle(client);

/* ---------- deterministic randomness ---------------------------------------------------------
 * A seeded generator, so re-running produces the same history and a screenshot stays valid. */
let state = 20260701;
function random(): number {
  state = (state * 1103515245 + 12345) & 0x7fffffff;
  return state / 0x7fffffff;
}
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const chance = (probability: number) => random() < probability;
const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)];

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (const cursor = new Date(`${from}T12:00:00`); isoDate(cursor) <= to; cursor.setDate(cursor.getDate() + 1)) {
    days.push(isoDate(cursor));
  }
  return days;
}

/* ---------- timing ---------------------------------------------------------------------------
 * Minutes between one recorded step and the next. Dwell inside a station is short; the three
 * long gaps are the train actually moving, and the two ТОИР gaps are the work itself. */
const DWELL = { BK: [15, 45], GRD: [10, 30], TBS: [20, 55] } as const;
const TRANSIT = {
  11: [35, 70], // Böyük Kəsik -> Gardabani
  17: [100, 170], // Gardabani -> Tbilisi
  23: [100, 170], // Tbilisi -> Gardabani
  25: [35, 70], // Gardabani -> Böyük Kəsik
} as const;
/** Gap after the send step: how long the locomotive is in the workshop. */
const MAINTENANCE_MINUTES = [90, 320] as const;

async function main() {
  const [stationRows, catalogue, locomotiveRows, userRows] = await Promise.all([
    db.select().from(stations),
    db.select().from(operationTypes).orderBy(asc(operationTypes.seq)),
    db.select().from(locomotives).where(eq(locomotives.isActive, true)).orderBy(asc(locomotives.id)),
    db.select().from(users),
  ]);

  const stationCode = new Map(stationRows.map((s) => [s.id, s.code]));
  const admin = userRows.find((u) => u.role === "admin");
  if (!admin) throw new Error("no admin user — run `npm run db:seed` first");
  if (locomotiveRows.length === 0) throw new Error("no active locomotives — run `npm run db:seed` first");

  // An operation is recorded by whoever works that station, falling back to the admin.
  const operatorByStation = new Map(
    stationRows.map((s) => [s.id, userRows.find((u) => u.stationId === s.id && u.isActive)?.id ?? admin.id]),
  );

  // Böyük Kəsik opens the outbound leg, so a turnaround that walks this catalogue is an even train.
  const evenTrains = ["2602", "2604", "2606", "2608", "2610", "2682", "2684", "2686", "2688", "2690"];

  const bySeq = new Map(catalogue.map((o) => [o.seq, o]));
  const lastSeq = Math.max(...catalogue.map((o) => o.seq));

  // Everything in the window goes, including the maintenance rows that would otherwise be left
  // behind pointing at nothing (turnaroundId is ON DELETE SET NULL, not CASCADE).
  await db.execute(sql`select set_config('railops.actor_id', ${String(admin.id)}, true)`);
  const doomed = await db
    .select({ id: turnarounds.id })
    .from(turnarounds)
    .where(and(gte(turnarounds.cycleDate, FROM), lte(turnarounds.cycleDate, TO)));
  if (doomed.length > 0) {
    const ids = doomed.map((r) => r.id);
    await db.delete(maintenanceRecords).where(inArray(maintenanceRecords.turnaroundId, ids));
    await db.delete(turnarounds).where(inArray(turnarounds.id, ids));
  }

  const days = eachDay(FROM, TO);
  // The last two days are still being worked, so their turnarounds are left part-filled.
  const openFrom = days.at(-2) ?? days.at(-1)!;
  let operationCount = 0;
  let maintenanceCount = 0;
  /** Where each locomotive ended up, so the registry agrees with the history. */
  const locomotiveAt = new Map<number, number>();

  for (const [dayIndex, cycleDate] of days.entries()) {
    for (let slot = 0; slot < PER_DAY; slot++) {
      const train = evenTrains[(dayIndex * PER_DAY + slot) % evenTrains.length];
      const locomotive = locomotiveRows[(dayIndex * PER_DAY + slot) % locomotiveRows.length];

      // A part-filled turnaround stops at a random step; a cancelled one stops early and stays.
      const unfinished = cycleDate >= openFrom;
      const cancelled = !unfinished && chance(0.02);
      // Half of the unfinished ones stop on the ТОИР send at Böyük Kəsik, which is what an open
      // technical work record means: that locomotive is in the workshop right now.
      const inWorkshop = unfinished && chance(0.5);
      // One train has only just pulled in, so it is still `open` rather than `in_progress`.
      const justArrived = unfinished && dayIndex === days.length - 1 && slot === 0;
      const stopAfter = justArrived
        ? 1
        : inWorkshop
          ? 27
          : unfinished
            ? between(2, lastSeq - 1)
            : cancelled
              ? between(4, 12)
              : lastSeq;

      // Which optional and conditional steps this run recorded.
      const detach = chance(0.15);
      const tbilisiMaintenance = chance(0.12);
      // The return step is what lets the turnaround close, so an unfinished one may still be open.
      const tbilisiReturn = tbilisiMaintenance && (!unfinished || chance(0.6));
      const reattach = chance(0.35);
      const skipped = new Set<number>();
      if (!detach) skipped.add(6);
      if (!tbilisiMaintenance) skipped.add(19);
      if (!tbilisiReturn) skipped.add(20);
      if (!reattach) skipped.add(21);
      // Closing needs the ТОИР return at Böyük Kəsik; leave it off only while still in progress.
      if (unfinished) skipped.add(28);

      const [openedBy] = [operatorByStation.get(bySeq.get(1)!.stationId) ?? admin.id];
      await db.execute(sql`select set_config('railops.actor_id', ${String(openedBy)}, true)`);

      const [turnaround] = await db
        .insert(turnarounds)
        .values({
          trainNumber: train,
          locomotiveId: locomotive.id,
          cycleDate,
          statusCode: cancelled ? "cancelled" : justArrived ? "open" : unfinished ? "in_progress" : "completed",
          openedBy,
          note: cancelled ? "Qatar ləğv edildi" : null,
        })
        .returning({ id: turnarounds.id });

      // Walk the catalogue, accumulating wall-clock time. The train arrives early morning.
      let at = new Date(`${cycleDate}T0${between(4, 8)}:${String(between(0, 55)).padStart(2, "0")}:00`);
      let previousStation: number | null = null;
      const entries: (typeof turnaroundOperations.$inferInsert)[] = [];
      const recorded = new Map<number, Date>();

      for (let seq = 1; seq <= stopAfter; seq++) {
        const operation = bySeq.get(seq);
        if (!operation || !operation.isActive) continue;
        if (skipped.has(seq)) {
          previousStation = operation.stationId;
          continue;
        }

        if (previousStation !== null) {
          const transit = TRANSIT[(seq - 1) as keyof typeof TRANSIT];
          if (transit) {
            at = addMinutes(at, between(transit[0], transit[1]));
          } else if (recorded.has(seq - 1) && bySeq.get(seq - 1)?.maintenanceEffect === "send") {
            at = addMinutes(at, between(MAINTENANCE_MINUTES[0], MAINTENANCE_MINUTES[1]));
          } else if (operation.parallelWithSeq !== null && recorded.has(operation.parallelWithSeq)) {
            // Simultaneous steps share a moment; a few minutes apart is how they get written down.
            at = addMinutes(recorded.get(operation.parallelWithSeq)!, between(0, 6));
          } else {
            const dwell = DWELL[(stationCode.get(operation.stationId) ?? "BK") as keyof typeof DWELL];
            at = addMinutes(at, between(dwell[0], dwell[1]));
          }
        }

        entries.push({
          turnaroundId: turnaround.id,
          operationTypeId: operation.id,
          occurredAt: at,
          // Only the fields the operation declares — the same set the form would demand.
          trainNumber: operation.fields.includes("train_number") ? train : null,
          locomotiveId: operation.fields.includes("locomotive") ? locomotive.id : null,
          detachReasonCode: operation.fields.includes("detach_reason")
            ? pick(["technical", "commercial", "customs", "other"])
            : null,
          maintenanceReasonCode: operation.fields.includes("maintenance_reason")
            ? pick(["scheduled", "scheduled", "malfunction", "other"])
            : null,
          maintenanceTypeCode: operation.fields.includes("maintenance_type")
            ? pick(["TO1", "TO2", "TO2", "TO3", "TR1"])
            : null,
          recordedBy: operatorByStation.get(operation.stationId) ?? admin.id,
        });
        recorded.set(seq, at);
        previousStation = operation.stationId;
      }

      await db.insert(turnaroundOperations).values(entries);
      operationCount += entries.length;

      // One maintenance row per send step, closed by the matching return step if it happened.
      for (const send of entries.filter((e) => byId(catalogue, e.operationTypeId).maintenanceEffect === "send")) {
        const sendSeq = byId(catalogue, send.operationTypeId).seq;
        const back = entries.find((e) => byId(catalogue, e.operationTypeId).conditionalOnSeq === sendSeq);
        await db.insert(maintenanceRecords).values({
          locomotiveId: locomotive.id,
          turnaroundId: turnaround.id,
          typeCode: back?.maintenanceTypeCode ?? send.maintenanceTypeCode,
          reasonCode: send.maintenanceReasonCode,
          sentAt: send.occurredAt as Date,
          returnedAt: (back?.occurredAt as Date) ?? null,
          createdBy: send.recordedBy,
        });
        maintenanceCount += 1;
      }

      const last = entries.at(-1);
      if (last) {
        // The row was inserted just now, but it belongs to its own day — and a finished
        // turnaround closed at its last recorded step, not at "now".
        await db
          .update(turnarounds)
          .set({
            createdAt: entries[0].occurredAt as Date,
            updatedAt: last.occurredAt as Date,
            ...(unfinished ? {} : { closedAt: last.occurredAt as Date }),
          })
          .where(eq(turnarounds.id, turnaround.id));
        locomotiveAt.set(locomotive.id, byId(catalogue, last.operationTypeId).stationId);
      }
    }
  }

  await db.execute(sql`select set_config('railops.actor_id', ${String(admin.id)}, true)`);
  for (const [locomotiveId, stationId] of locomotiveAt) {
    await db.update(locomotives).set({ currentStationId: stationId }).where(eq(locomotives.id, locomotiveId));
  }

  const [[turnaroundTotal]] = await Promise.all([
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(turnarounds)
      .where(and(gte(turnarounds.cycleDate, FROM), lte(turnarounds.cycleDate, TO))),
  ]);

  console.log(
    `demo data ${FROM}..${TO}: ${turnaroundTotal.value} turnarounds, ${operationCount} operations, ${maintenanceCount} technical work records`,
  );
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function byId(catalogue: (typeof operationTypes.$inferSelect)[], id: number) {
  const found = catalogue.find((o) => o.id === id);
  if (!found) throw new Error(`unknown operation type ${id}`);
  return found;
}

await main();
await client.end();

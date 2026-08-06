import { and, asc, eq, isNotNull, isNull, notInArray } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import {
  locomotives,
  maintenanceRecords,
  operationTypes,
  referenceValues,
  stations,
  trainNumbers,
  turnaroundOperations,
  turnarounds,
} from "@/db/schema";
import { FINISHED_STATUSES } from "@/lib/turnaround-rules";

/** The 28-step turnaround sequence, ordered. Cached per request. */
export const getCatalogue = cache(async () => db.select().from(operationTypes).orderBy(asc(operationTypes.seq)));

export const getStations = cache(async () => db.select().from(stations).orderBy(asc(stations.sortOrder)));

export const getReference = cache(async (kind: string) =>
  db
    .select()
    .from(referenceValues)
    .where(and(eq(referenceValues.kind, kind), eq(referenceValues.isActive, true)))
    .orderBy(asc(referenceValues.sortOrder)),
);

export const getActiveLocomotives = cache(async () =>
  db.select().from(locomotives).where(eq(locomotives.isActive, true)).orderBy(asc(locomotives.number)),
);

/**
 * Active locomotives minus those occupied: on an unfinished turnaround (whether the turnaround
 * already carries the locomotive or only an operation recorded it) or in open ТОИР.
 * `forTurnaroundId` keeps that turnaround's own locomotives selectable, so its steps stay editable.
 */
export const getAvailableLocomotives = cache(async (forTurnaroundId?: number) => {
  const unfinished = notInArray(turnarounds.statusCode, [...FINISHED_STATUSES]);
  const [locos, viaTurnaround, viaOperation, inMaintenance] = await Promise.all([
    getActiveLocomotives(),
    db
      .select({ locomotiveId: turnarounds.locomotiveId, turnaroundId: turnarounds.id })
      .from(turnarounds)
      .where(and(isNotNull(turnarounds.locomotiveId), unfinished)),
    db
      .select({
        locomotiveId: turnaroundOperations.locomotiveId,
        turnaroundId: turnaroundOperations.turnaroundId,
      })
      .from(turnaroundOperations)
      .innerJoin(turnarounds, eq(turnarounds.id, turnaroundOperations.turnaroundId))
      .where(and(isNotNull(turnaroundOperations.locomotiveId), unfinished)),
    db
      .select({ locomotiveId: maintenanceRecords.locomotiveId })
      .from(maintenanceRecords)
      .where(isNull(maintenanceRecords.returnedAt)),
  ]);

  const busy = new Set(inMaintenance.map((r) => r.locomotiveId));
  for (const r of [...viaTurnaround, ...viaOperation]) {
    if (r.locomotiveId !== null && r.turnaroundId !== forTurnaroundId) busy.add(r.locomotiveId);
  }
  return locos.filter((l) => !busy.has(l.id));
});

export const getActiveTrainNumbers = cache(async () =>
  db.select().from(trainNumbers).where(eq(trainNumbers.isActive, true)).orderBy(asc(trainNumbers.number)),
);

/** Everything the turnaround form needs to render its selects, in one round of queries. */
export async function getFormOptions() {
  const [catalogue, stationRows, locos, trains, maintenanceTypes, maintenanceReasons, detachReasons, statuses] =
    await Promise.all([
      getCatalogue(),
      getStations(),
      getActiveLocomotives(),
      getActiveTrainNumbers(),
      getReference("maintenance_type"),
      getReference("maintenance_reason"),
      getReference("detach_reason"),
      getReference("turnaround_status"),
    ]);

  return { catalogue, stations: stationRows, locomotives: locos, trainNumbers: trains, maintenanceTypes, maintenanceReasons, detachReasons, statuses };
}

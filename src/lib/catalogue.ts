import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { locomotives, operationTypes, referenceValues, stations, trainNumbers } from "@/db/schema";

/** The 29-step turnaround sequence, ordered. Cached per request. */
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

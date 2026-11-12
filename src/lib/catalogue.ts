import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { locomotives, operationTypes, referenceValues, stations } from "@/db/schema";

/** Both routes' sequences, ordered by route then step. Narrow with `forRoute`. Cached per request. */
export const getCatalogue = cache(async () =>
  db.select().from(operationTypes).orderBy(asc(operationTypes.route), asc(operationTypes.seq)),
);

/** The stations on the route today — what every picker and the corridor heading show. */
export const getStations = cache(async () =>
  db.select().from(stations).where(eq(stations.isActive, true)).orderBy(asc(stations.sortOrder)),
);

/** Retired stations included, for labelling history recorded while they were still on the route. */
export const getAllStations = cache(async () => db.select().from(stations).orderBy(asc(stations.sortOrder)));

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

/** Everything the turnaround form needs to render its selects, in one round of queries. */
export async function getFormOptions() {
  const [catalogue, stationRows, locos, maintenanceTypes, maintenanceReasons, detachReasons, statuses] =
    await Promise.all([
      getCatalogue(),
      getAllStations(),
      getActiveLocomotives(),
      getReference("maintenance_type"),
      getReference("maintenance_reason"),
      getReference("detach_reason"),
      getReference("turnaround_status"),
    ]);

  return { catalogue, stations: stationRows, locomotives: locos, maintenanceTypes, maintenanceReasons, detachReasons, statuses };
}

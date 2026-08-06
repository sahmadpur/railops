import { eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";

import { locomotives, trainNumbers, turnarounds } from "@/db/schema";

export type TurnaroundFilterInput = {
  from?: string | null;
  to?: string | null;
  status?: string | null;
  locomotiveId?: string | null;
  trainNumberId?: string | null;
  q?: string | null;
};

/**
 * The turnaround list's WHERE clauses, shared by the page and its Excel export so the file
 * always matches the screen. Callers must join trainNumbers and locomotives (both already do).
 */
export function turnaroundFilters(input: TurnaroundFilterInput): SQL[] {
  const filters: SQL[] = [];
  if (input.from) filters.push(gte(turnarounds.cycleDate, input.from));
  if (input.to) filters.push(lte(turnarounds.cycleDate, input.to));
  if (input.status) filters.push(eq(turnarounds.statusCode, input.status));
  if (input.locomotiveId) filters.push(eq(turnarounds.locomotiveId, Number(input.locomotiveId)));
  if (input.trainNumberId) filters.push(eq(turnarounds.trainNumberId, Number(input.trainNumberId)));
  if (input.q) {
    filters.push(or(ilike(trainNumbers.number, `%${input.q}%`), ilike(locomotives.number, `%${input.q}%`))!);
  }
  return filters;
}

import { and, count, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { db } from "@/db";
import { locomotives, maintenanceRecords, operationTypes, turnaroundOperations, turnarounds } from "@/db/schema";
import { getStations } from "@/lib/catalogue";
import { formatDate, label, todayIso } from "@/lib/format";
import { requireSession } from "@/lib/session";

// Internal tool on a LAN: a short revalidate window beats websockets.
// ponytail: raise to live updates only if operators actually watch this page.
export const revalidate = 30;

export default async function DashboardPage() {
  await requireSession();
  const [t, locale, stationRows] = await Promise.all([getTranslations(), getLocale(), getStations()]);
  const today = todayIso();

  const [[inProgress], [completedToday], [openMaintenance], [activeLocomotives], perStation, recent, [avg]] =
    await Promise.all([
      db.select({ value: count() }).from(turnarounds).where(isNull(turnarounds.closedAt)),
      db
        .select({ value: count() })
        .from(turnarounds)
        .where(and(isNotNull(turnarounds.closedAt), eq(turnarounds.cycleDate, today))),
      db.select({ value: count() }).from(maintenanceRecords).where(isNull(maintenanceRecords.returnedAt)),
      db.select({ value: count() }).from(locomotives).where(eq(locomotives.isActive, true)),
      db
        .select({ stationId: operationTypes.stationId, value: count() })
        .from(turnaroundOperations)
        .innerJoin(operationTypes, eq(operationTypes.id, turnaroundOperations.operationTypeId))
        .where(gte(turnaroundOperations.occurredAt, sql`current_date`))
        .groupBy(operationTypes.stationId),
      db
        .select({
          id: turnarounds.id,
          cycleDate: turnarounds.cycleDate,
          statusCode: turnarounds.statusCode,
          number: locomotives.number,
        })
        .from(turnarounds)
        .innerJoin(locomotives, eq(locomotives.id, turnarounds.locomotiveId))
        .orderBy(desc(turnarounds.cycleDate), desc(turnarounds.id))
        .limit(8),
      // Average span between first and last recorded operation, over the last 30 days.
      db.execute<{ minutes: number | null }>(sql`
        select avg(extract(epoch from (span.last_at - span.first_at)) / 60)::int as minutes
        from (
          select o.turnaround_id, min(o.occurred_at) as first_at, max(o.occurred_at) as last_at
          from turnaround_operations o
          join turnarounds tr on tr.id = o.turnaround_id
          where tr.cycle_date >= current_date - interval '30 days'
          group by o.turnaround_id
          having count(*) > 1
        ) span
      `),
    ]);

  const perStationMap = new Map(perStation.map((r) => [r.stationId, r.value]));
  const avgMinutes = avg?.minutes ?? null;

  const tiles = [
    { text: t("dashboard.openTurnarounds"), value: inProgress.value },
    { text: t("dashboard.completedToday"), value: completedToday.value },
    { text: t("dashboard.openMaintenance"), value: openMaintenance.value },
    { text: t("dashboard.locomotivesActive"), value: activeLocomotives.value },
    {
      text: t("dashboard.avgElapsed"),
      value:
        avgMinutes === null
          ? "—"
          : `${String(Math.floor(avgMinutes / 60)).padStart(2, "0")}:${String(avgMinutes % 60).padStart(2, "0")}`,
    },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">{t("dashboard.title")}</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.text} className="border-line bg-surface rounded border p-3">
            <div className="text-muted text-xs">{tile.text}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</div>
          </div>
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-medium">{t("dashboard.byStation")}</h2>
          <table className="data-table">
            <tbody>
              {stationRows.map((station) => (
                <tr key={station.id}>
                  <td>{label(station.name, locale)}</td>
                  <td className="w-16 text-end tabular-nums">{perStationMap.get(station.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium">{t("dashboard.recent")}</h2>
          <table className="data-table">
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td className="text-muted text-center">{t("common.empty")}</td>
                </tr>
              )}
              {recent.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/turnarounds/${row.id}`} className="text-accent hover:underline">
                      #{row.id}
                    </Link>
                  </td>
                  <td>{row.number}</td>
                  <td className="whitespace-nowrap">{formatDate(row.cycleDate, locale)}</td>
                  <td className="text-muted">{row.statusCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

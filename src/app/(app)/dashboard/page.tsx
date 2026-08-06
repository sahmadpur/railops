import { and, count, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import RowLink from "@/components/RowLink";
import StatusBadge from "@/components/StatusBadge";
import { db } from "@/db";
import {
  locomotives,
  maintenanceRecords,
  operationTypes,
  trainNumbers,
  turnaroundOperations,
  turnarounds,
} from "@/db/schema";
import { getReference, getStations } from "@/lib/catalogue";
import { formatDate, label, todayIso } from "@/lib/format";
import { requireSession } from "@/lib/session";

// Internal tool on a LAN: a short revalidate window beats websockets.
// ponytail: raise to live updates only if operators actually watch this page.
export const revalidate = 30;

export default async function DashboardPage() {
  await requireSession();
  const [t, locale, stationRows, statuses] = await Promise.all([
    getTranslations(),
    getLocale(),
    getStations(),
    getReference("turnaround_status"),
  ]);
  const statusLabel = new Map(statuses.map((s) => [s.code, label(s.label, locale)]));
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
          number: trainNumbers.number,
        })
        .from(turnarounds)
        .innerJoin(trainNumbers, eq(trainNumbers.id, turnarounds.trainNumberId))
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
    {
      text: t("dashboard.openTurnarounds"),
      value: inProgress.value,
      icon: "M4 8h11a4 4 0 0 1 0 8H7m0 0 3-3m-3 3 3 3",
    },
    { text: t("dashboard.completedToday"), value: completedToday.value, icon: "m5 13 4 4L19 7" },
    {
      text: t("dashboard.openMaintenance"),
      value: openMaintenance.value,
      icon: "m14.5 5.5 4 4M4 20l4.5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9z",
    },
    {
      text: t("dashboard.locomotivesActive"),
      value: activeLocomotives.value,
      icon: "M6 4h12v9H6zM4 13h16l-2 5H6zM8 20h2M14 20h2",
    },
    {
      text: t("dashboard.avgElapsed"),
      value:
        avgMinutes === null
          ? "—"
          : `${String(Math.floor(avgMinutes / 60)).padStart(2, "0")}:${String(avgMinutes % 60).padStart(2, "0")}`,
      icon: "M12 8v4l3 2M21 12a9 9 0 1 1-9-9",
    },
  ];

  const busiest = Math.max(1, ...stationRows.map((s) => perStationMap.get(s.id) ?? 0));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t("dashboard.title")}</h1>
        <p className="text-muted mt-1 text-sm">{t("app.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.text} className="card card-pad">
            <span className="bg-surface-muted text-muted grid size-11 place-items-center rounded-xl">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden
              >
                <path d={tile.icon} />
              </svg>
            </span>
            <div className="text-muted mt-4 text-sm">{tile.text}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</div>
          </div>
        ))}
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">{t("dashboard.byStation")}</h2>
          </div>
          <ul className="divide-line divide-y">
            {stationRows.map((station) => {
              const value = perStationMap.get(station.id) ?? 0;
              return (
                <li key={station.id} className="flex items-center gap-4 px-5 py-3.5">
                  <span className="w-40 shrink-0 text-sm font-medium">{label(station.name, locale)}</span>
                  <span className="bg-surface-muted h-2 flex-1 overflow-hidden rounded-full">
                    <span
                      className="bg-accent block h-full rounded-full"
                      style={{ width: `${Math.round((value / busiest) * 100)}%` }}
                    />
                  </span>
                  <span className="w-8 text-end text-sm font-medium tabular-nums">{value}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">{t("dashboard.recent")}</h2>
            <Link href="/turnarounds" className="btn px-3 py-1.5 text-xs">
              {t("nav.turnarounds")}
            </Link>
          </div>
          <table className="data-table">
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td className="text-muted px-5 py-6 text-center">{t("common.empty")}</td>
                </tr>
              )}
              {recent.map((row) => (
                <RowLink key={row.id} href={`/turnarounds/${row.id}`}>
                  <td className="ps-5">
                    <Link href={`/turnarounds/${row.id}`} className="text-accent font-medium hover:underline">
                      #{row.id}
                    </Link>
                  </td>
                  <td className="font-medium">{row.number}</td>
                  <td className="text-muted whitespace-nowrap">{formatDate(row.cycleDate, locale)}</td>
                  <td className="pe-5 text-end">
                    <StatusBadge code={row.statusCode} text={statusLabel.get(row.statusCode)} />
                  </td>
                </RowLink>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

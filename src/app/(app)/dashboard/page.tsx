import { and, asc, count, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
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
import { getCatalogue, getReference, getStations } from "@/lib/catalogue";
import { formatDate, label, todayIso } from "@/lib/format";
import { operationStats, routeSegments, segmentStats } from "@/lib/timeline";
import { requireSession } from "@/lib/session";
import { formatElapsed } from "@/lib/turnaround-rules";

/** Default window: the trailing month, matching the average the tile used to hardcode. */
function defaultRange(): { from: string; to: string } {
  const to = todayIso();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`, to };
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await requireSession();
  const [t, locale, query, stationRows, statuses, catalogue] = await Promise.all([
    getTranslations(),
    getLocale(),
    searchParams,
    getStations(),
    getReference("turnaround_status"),
    getCatalogue(),
  ]);

  const fallback = defaultRange();
  const from = typeof query.from === "string" && query.from ? query.from : fallback.from;
  const to = typeof query.to === "string" && query.to ? query.to : fallback.to;
  const selected = typeof query.station === "string" ? Number(query.station) : null;

  const inRange = and(gte(turnarounds.cycleDate, from), lte(turnarounds.cycleDate, to));
  const statusLabel = new Map(statuses.map((s) => [s.code, label(s.label, locale)]));
  const stationName = new Map(stationRows.map((s) => [s.id, label(s.name, locale)]));

  const [[inProgress], [completed], [openMaintenance], [activeLocomotives], [turnaroundsInRange], recent, rows] =
    await Promise.all([
      db.select({ value: count() }).from(turnarounds).where(isNull(turnarounds.closedAt)),
      db
        .select({ value: count() })
        .from(turnarounds)
        .where(and(isNotNull(turnarounds.closedAt), inRange)),
      db.select({ value: count() }).from(maintenanceRecords).where(isNull(maintenanceRecords.returnedAt)),
      db.select({ value: count() }).from(locomotives).where(eq(locomotives.isActive, true)),
      db.select({ value: count() }).from(turnarounds).where(inRange),
      db
        .select({
          id: turnarounds.id,
          cycleDate: turnarounds.cycleDate,
          statusCode: turnarounds.statusCode,
          number: trainNumbers.number,
        })
        .from(turnarounds)
        .innerJoin(trainNumbers, eq(trainNumbers.id, turnarounds.trainNumberId))
        .where(inRange)
        .orderBy(desc(turnarounds.cycleDate), desc(turnarounds.id))
        .limit(8),
      // Every operation in the window; the timeline and its drill-down are both computed from it.
      db
        .select({
          turnaroundId: turnaroundOperations.turnaroundId,
          operationTypeId: turnaroundOperations.operationTypeId,
          seq: operationTypes.seq,
          occurredAt: turnaroundOperations.occurredAt,
        })
        .from(turnaroundOperations)
        .innerJoin(operationTypes, eq(operationTypes.id, turnaroundOperations.operationTypeId))
        .innerJoin(turnarounds, eq(turnarounds.id, turnaroundOperations.turnaroundId))
        .where(inRange)
        .orderBy(asc(turnaroundOperations.turnaroundId), asc(operationTypes.seq)),
    ]);

  const segments = routeSegments(catalogue);
  const stats = segmentStats(segments, rows);
  const detail = selected !== null ? stats[selected] : undefined;
  const detailOperations = detail ? operationStats(detail.segment, rows) : [];
  const operationName = new Map(catalogue.map((o) => [o.id, label(o.label, locale)]));

  // Whole-route average: first to last operation of each turnaround.
  const spans = [...new Set(rows.map((r) => r.turnaroundId))]
    .map((id) => rows.filter((r) => r.turnaroundId === id))
    .filter((entries) => entries.length > 1)
    .map((entries) => (entries.at(-1)!.occurredAt.getTime() - entries[0].occurredAt.getTime()) / 60000);
  const avgMinutes = spans.length ? Math.round(spans.reduce((sum, v) => sum + v, 0) / spans.length) : null;

  const tiles = [
    {
      text: t("dashboard.openTurnarounds"),
      value: inProgress.value,
      icon: "M4 8h11a4 4 0 0 1 0 8H7m0 0 3-3m-3 3 3 3",
    },
    { text: t("dashboard.completedInRange"), value: completed.value, icon: "m5 13 4 4L19 7" },
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
      value: formatElapsed(avgMinutes),
      icon: "M12 8v4l3 2M21 12a9 9 0 1 1-9-9",
    },
  ];

  const longest = Math.max(1, ...stats.map((s) => s.avgMinutes ?? 0));
  const segmentTitle = (segment: (typeof segments)[number]) =>
    `${stationName.get(segment.stationId) ?? "—"}${segment.pass > 1 ? ` · ${t("dashboard.timeline.returnLeg")}` : ""}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t("dashboard.title")}</h1>
        <p className="text-muted mt-1 text-sm">{t("app.subtitle")}</p>
      </div>

      <form className="filter-bar">
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.from")}</span>
          <input type="date" name="from" defaultValue={from} className="field w-auto" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.to")}</span>
          <input type="date" name="to" defaultValue={to} className="field w-auto" />
        </label>
        <button type="submit" className="btn btn-primary">
          {t("common.filter")}
        </button>
        <Link href="/dashboard" className="btn">
          {t("common.reset")}
        </Link>
      </form>

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

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{t("dashboard.timeline.title")}</h2>
          <span className="text-muted text-xs">
            {t("dashboard.timeline.basedOn", { count: turnaroundsInRange.value })}
          </span>
        </div>
        <ul className="divide-line divide-y">
          {stats.map((row) => (
            <li key={row.segment.index}>
              <Link
                href={`/dashboard?from=${from}&to=${to}&station=${row.segment.index}`}
                scroll={false}
                className={`hover:bg-surface-muted flex items-center gap-4 px-5 py-3.5 ${
                  selected === row.segment.index ? "bg-surface-muted" : ""
                }`}
              >
                <span className="w-44 shrink-0">
                  <span className="block text-sm font-medium">{segmentTitle(row.segment)}</span>
                  <span className="text-faint text-[11px] tabular-nums">
                    {row.segment.fromSeq}–{row.segment.toSeq}
                  </span>
                </span>
                <span className="bg-surface-muted h-2 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-accent block h-full rounded-full"
                    style={{ width: `${Math.round(((row.avgMinutes ?? 0) / longest) * 100)}%` }}
                  />
                </span>
                <span className="w-16 text-end text-sm font-medium tabular-nums">{formatElapsed(row.avgMinutes)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {detail && (
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">{segmentTitle(detail.segment)}</h2>
            <Link href={`/dashboard?from=${from}&to=${to}`} className="btn px-3 py-1.5 text-xs">
              {t("common.back")}
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3">
            <div>
              <dt className="text-muted text-xs">{t("dashboard.timeline.avgTime")}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{formatElapsed(detail.avgMinutes)}</dd>
            </div>
            <div>
              <dt className="text-muted text-xs">{t("dashboard.timeline.turnarounds")}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{detail.turnarounds}</dd>
            </div>
            <div>
              <dt className="text-muted text-xs">{t("dashboard.timeline.operations")}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{detail.operations}</dd>
            </div>
          </dl>
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8">{t("admin.operations.seq")}</th>
                <th>{t("admin.operations.operation")}</th>
                <th className="w-24">{t("dashboard.timeline.recorded")}</th>
                <th className="w-24">{t("dashboard.timeline.stepTime")}</th>
              </tr>
            </thead>
            <tbody>
              {detailOperations.map((operation) => (
                <tr key={operation.operationTypeId}>
                  <td className="text-faint text-center tabular-nums">{operation.seq}</td>
                  <td className="font-medium">{operationName.get(operation.operationTypeId) ?? "—"}</td>
                  <td className="tabular-nums">{operation.count}</td>
                  <td className="tabular-nums">{formatElapsed(operation.avgStepMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
    </div>
  );
}

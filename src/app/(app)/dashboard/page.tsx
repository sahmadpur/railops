import { and, asc, count, desc, eq, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Fragment } from "react";

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
import { getActiveLocomotives, getCatalogue, getReference, getStations } from "@/lib/catalogue";
import { formatDate, label, operationNo, todayIso } from "@/lib/format";
import { downtimeMinutes, operationStats, routeSegments, segmentStats, transitStats, type Interval } from "@/lib/timeline";
import { requireAdmin } from "@/lib/session";
import { formatElapsed } from "@/lib/turnaround-rules";

/** Default window: the trailing month, matching the average the tile used to hardcode. */
function defaultRange(): { from: string; to: string } {
  const to = todayIso();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`, to };
}

/**
 * The downtime window in corridor wall-clock, like every timestamp here (containers run
 * TZ=Asia/Baku). It ends now at the latest, so the rest of today never counts as downtime.
 */
function downtimeWindow(from: string, to: string): { from: Date; to: Date } {
  const end = Math.min(Date.now(), new Date(`${to}T00:00:00`).getTime() + 86_400_000);
  return { from: new Date(`${from}T00:00:00`), to: new Date(end) };
}

// Node 24 ships Intl.DurationFormat; TypeScript's lib does not know it yet.
const { DurationFormat } = Intl as typeof Intl & {
  DurationFormat: new (
    locale: string,
    options?: { style?: string; minutesDisplay?: string },
  ) => { format: (duration: { days?: number; hours?: number; minutes?: number }) => string };
};

/** Long spans read as days/hours/minutes ("23 days, 14 hr, 3 min"), localized by the runtime. */
function formatDowntime(minutes: number, locale: string): string {
  return new DurationFormat(locale, { style: "short", minutesDisplay: "always" }).format({
    days: Math.floor(minutes / 1440),
    hours: Math.floor((minutes % 1440) / 60),
    minutes: minutes % 60,
  });
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await requireAdmin();
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
  const { from: windowFrom, to: windowTo } = downtimeWindow(from, to);
  const statusLabel = new Map(statuses.map((s) => [s.code, label(s.label, locale)]));
  const stationName = new Map(stationRows.map((s) => [s.id, label(s.name, locale)]));

  const [
    [inProgress],
    [completed],
    [openMaintenance],
    [activeLocomotives],
    [turnaroundsInRange],
    recent,
    rows,
    locomotiveRows,
    turnaroundSpans,
    maintenanceSpans,
  ] = await Promise.all([
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
      getActiveLocomotives(),
      // Busy spans for the downtime card: each turnaround the locomotive served, first to last
      // recorded operation. ponytail: the whole span counts as busy even though the locomotive
      // attaches mid-turnaround — split per-operation if dispatch ever needs the finer number.
      db
        .select({
          locomotiveId: turnarounds.locomotiveId,
          from: sql<string>`min(${turnaroundOperations.occurredAt})`,
          to: sql<string>`max(${turnaroundOperations.occurredAt})`,
        })
        .from(turnarounds)
        .innerJoin(turnaroundOperations, eq(turnaroundOperations.turnaroundId, turnarounds.id))
        .where(and(isNotNull(turnarounds.locomotiveId), inRange))
        .groupBy(turnarounds.id, turnarounds.locomotiveId),
      // ТОИР intervals that touch the window; an open record runs to now.
      db
        .select({
          locomotiveId: maintenanceRecords.locomotiveId,
          sentAt: maintenanceRecords.sentAt,
          returnedAt: maintenanceRecords.returnedAt,
        })
        .from(maintenanceRecords)
        .where(
          and(
            lte(maintenanceRecords.sentAt, windowTo),
            or(isNull(maintenanceRecords.returnedAt), gte(maintenanceRecords.returnedAt, windowFrom)),
          ),
        ),
    ]);

  const busyByLocomotive = new Map<number, Interval[]>();
  const markBusy = (locomotiveId: number, interval: Interval) => {
    const list = busyByLocomotive.get(locomotiveId);
    if (list) list.push(interval);
    else busyByLocomotive.set(locomotiveId, [interval]);
  };
  for (const span of turnaroundSpans) {
    if (span.locomotiveId) markBusy(span.locomotiveId, { from: new Date(span.from), to: new Date(span.to) });
  }
  for (const record of maintenanceSpans) {
    // An open ТОИР record runs to the end of the window — downtimeMinutes clips it anyway.
    markBusy(record.locomotiveId, { from: record.sentAt, to: record.returnedAt ?? windowTo });
  }
  const downtime = locomotiveRows
    .map((locomotive) => ({
      locomotive,
      minutes: downtimeMinutes(windowFrom, windowTo, busyByLocomotive.get(locomotive.id) ?? []),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const segments = routeSegments(catalogue);
  const stats = segmentStats(segments, rows);
  const transit = transitStats(segments, rows);
  const detail = selected !== null ? stats[selected] : undefined;
  const detailOperations = detail ? operationStats(detail.segment, rows) : [];
  const operationName = new Map(catalogue.map((o) => [o.id, label(o.label, locale)]));
  const operationNumber = new Map(catalogue.map((o) => [o.id, operationNo(o)]));

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

        {/* The corridor drawn as the line it is: stops on a continuous track, time on the move
            between them. Each column carries its own half of the track, so the rail stays
            joined at any width without absolute positioning. */}
        <div className="overflow-x-auto px-5 pb-6 pt-5">
          <div className="flex min-w-max justify-center">
            {stats.map((row, index) => {
              const isSelected = selected === row.segment.index;
              return (
                <Fragment key={row.segment.index}>
                  <Link
                    href={`/dashboard?from=${from}&to=${to}&station=${row.segment.index}`}
                    scroll={false}
                    className="group flex w-28 shrink-0 flex-col items-center"
                  >
                    <span className="flex h-4 w-full items-center">
                      <span className={`h-0.5 flex-1 ${index === 0 ? "" : "bg-line"}`} />
                      <span
                        className={`group-hover:ring-accent/30 size-3 rounded-full ring-4 transition ${
                          isSelected ? "bg-accent ring-accent/25" : "bg-accent/70 ring-transparent"
                        }`}
                      />
                      <span className={`h-0.5 flex-1 ${index === stats.length - 1 ? "" : "bg-line"}`} />
                    </span>
                    <span
                      className={`mt-2.5 text-center text-xs leading-tight ${
                        isSelected ? "text-accent font-semibold" : "group-hover:text-accent font-medium"
                      }`}
                    >
                      {stationName.get(row.segment.stationId) ?? "—"}
                    </span>
                    {/* Held even when empty so every dwell time sits on the same baseline. */}
                    <span className="text-faint h-3.5 text-[10px]">
                      {row.segment.pass > 1 ? t("dashboard.timeline.returnLeg") : ""}
                    </span>
                    <span className="mt-0.5 text-sm font-semibold tabular-nums">{formatElapsed(row.avgMinutes)}</span>
                  </Link>

                  {index < transit.length && (
                    <span className="flex w-24 shrink-0 flex-col items-center">
                      <span className="flex h-4 w-full items-center">
                        <span className="bg-line h-0.5 flex-1" />
                        <svg
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          className="text-faint shrink-0"
                          aria-hidden
                        >
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                        <span className="bg-line h-0.5 flex-1" />
                      </span>
                      <span className="text-faint mt-2.5 text-[10px] leading-tight">
                        {t("dashboard.timeline.inTransit")}
                      </span>
                      <span className="text-muted h-3.5 text-[11px] tabular-nums">{formatElapsed(transit[index])}</span>
                    </span>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>

        <ul className="divide-line border-line divide-y border-t">
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

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{t("dashboard.locomotiveDowntime")}</h2>
          <span className="text-muted text-xs">
            {formatDate(from, locale)} – {formatDate(to, locale)}
          </span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("common.locomotive")}</th>
              <th className="whitespace-nowrap">{t("dashboard.downtime")}</th>
            </tr>
          </thead>
          <tbody>
            {downtime.length === 0 && (
              <tr>
                <td colSpan={2} className="text-muted text-center">
                  {t("common.empty")}
                </td>
              </tr>
            )}
            {downtime.map(({ locomotive, minutes }) => (
              <tr key={locomotive.id}>
                <td className="font-medium">
                  {locomotive.number} · {locomotive.owner}
                </td>
                <td className="whitespace-nowrap tabular-nums">{formatDowntime(minutes, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
                  <td className="text-faint text-center tabular-nums">{operationNumber.get(operation.operationTypeId) ?? "—"}</td>
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

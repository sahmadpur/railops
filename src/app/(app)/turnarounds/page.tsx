import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import RowLink from "@/components/RowLink";
import SearchSelect from "@/components/SearchSelect";
import StatusBadge from "@/components/StatusBadge";
import { db } from "@/db";
import { locomotives, trainNumbers, turnaroundOperations, turnarounds, users } from "@/db/schema";
import { getFormOptions } from "@/lib/catalogue";
import { formatDate, label } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { turnaroundFilters } from "@/lib/turnaround-filters";
import { nextStationId, type EntryLike } from "@/lib/turnaround-rules";

export default async function TurnaroundsPage({ searchParams }: PageProps<"/turnarounds">) {
  const session = await requireSession();
  const [t, locale, query, options] = await Promise.all([
    getTranslations(),
    getLocale(),
    searchParams,
    getFormOptions(),
  ]);

  const from = typeof query.from === "string" ? query.from : "";
  const to = typeof query.to === "string" ? query.to : "";
  const status = typeof query.status === "string" ? query.status : "";
  const locomotiveId = typeof query.locomotiveId === "string" ? query.locomotiveId : "";
  const trainNumberId = typeof query.trainNumberId === "string" ? query.trainNumberId : "";
  const q = typeof query.q === "string" ? query.q.trim() : "";

  const filters = turnaroundFilters({ from, to, status, locomotiveId, trainNumberId, q });
  const where = filters.length ? and(...filters) : undefined;

  let rows = await db
    .select({
      id: turnarounds.id,
      cycleDate: turnarounds.cycleDate,
      statusCode: turnarounds.statusCode,
      closedAt: turnarounds.closedAt,
      trainNumber: trainNumbers.number,
      // Null until an attachment step records the locomotive.
      locomotiveNumber: locomotives.number,
      openedByName: users.fullName,
      filled: count(turnaroundOperations.id),
      firstAt: sql<Date | null>`min(${turnaroundOperations.occurredAt})`,
      lastAt: sql<Date | null>`max(${turnaroundOperations.occurredAt})`,
    })
    .from(turnarounds)
    .innerJoin(trainNumbers, eq(trainNumbers.id, turnarounds.trainNumberId))
    .leftJoin(locomotives, eq(locomotives.id, turnarounds.locomotiveId))
    .innerJoin(users, eq(users.id, turnarounds.openedBy))
    .leftJoin(turnaroundOperations, eq(turnaroundOperations.turnaroundId, turnarounds.id))
    .where(where)
    .groupBy(turnarounds.id, trainNumbers.number, locomotives.number, users.fullName)
    .orderBy(desc(turnarounds.cycleDate), desc(turnarounds.id))
    .limit(200);

  // An operator's list is the station's inbox: only records whose next unfilled mandatory step
  // is at their station — arrived from the previous station, gone again once their part is done.
  if (session.role === "operator" && rows.length) {
    const entryRows = await db
      .select({
        turnaroundId: turnaroundOperations.turnaroundId,
        operationTypeId: turnaroundOperations.operationTypeId,
        occurredAt: turnaroundOperations.occurredAt,
      })
      .from(turnaroundOperations)
      .where(
        inArray(
          turnaroundOperations.turnaroundId,
          rows.map((r) => r.id),
        ),
      );
    const entriesByTurnaround = new Map<number, EntryLike[]>();
    for (const entry of entryRows) {
      const list = entriesByTurnaround.get(entry.turnaroundId);
      if (list) list.push(entry);
      else entriesByTurnaround.set(entry.turnaroundId, [entry]);
    }
    // The route's final station: a fully filled but still-open turnaround stays on its list
    // until someone closes it, so finishing the last operation cannot strand the record.
    const lastStationId =
      options.catalogue.filter((o) => o.isActive).sort((a, b) => a.seq - b.seq).at(-1)?.stationId ?? null;
    rows = rows.filter((row) => {
      const next = nextStationId(options.catalogue, entriesByTurnaround.get(row.id) ?? []);
      if (next !== null) return next === session.stationId;
      return row.closedAt === null && lastStationId === session.stationId;
    });
  }

  const totalOperations = options.catalogue.filter((o) => o.isActive).length;
  const statusLabel = new Map(options.statuses.map((s) => [s.code, label(s.label, locale)]));
  const exportParams = new URLSearchParams(
    Object.entries({ from, to, status, locomotiveId, trainNumberId, q }).filter(([, v]) => v) as [string, string][],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{t("turnarounds.title")}</h1>
          <p className="text-muted mt-1 text-sm">
            {t("common.total")}: <span className="tabular-nums">{rows.length}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {session.role === "admin" && (
            <a href={`/api/export/turnarounds?${exportParams}`} className="btn text-xs">
              {t("common.exportExcel")}
            </a>
          )}
          <Link href="/turnarounds/new" className="btn btn-primary text-xs">
            {t("turnarounds.new")}
          </Link>
        </div>
      </div>

      <form className="filter-bar">
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.search")}</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("common.search")}
            className="field w-auto"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.from")}</span>
          <input type="date" name="from" defaultValue={from} className="field w-auto" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.to")}</span>
          <input type="date" name="to" defaultValue={to} className="field w-auto" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.trainNumber")}</span>
          <SearchSelect
            name="trainNumberId"
            options={options.trainNumbers.map((n) => ({ id: n.id, text: `${n.number} · ${n.country}` }))}
            defaultId={trainNumberId || null}
            placeholder={t("common.all")}
            className="field w-auto"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.locomotive")}</span>
          <select name="locomotiveId" defaultValue={locomotiveId} className="field w-auto">
            <option value="">{t("common.all")}</option>
            {options.locomotives.map((l) => (
              <option key={l.id} value={l.id}>
                {l.number}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.status")}</span>
          <select name="status" defaultValue={status} className="field w-auto">
            <option value="">{t("common.all")}</option>
            {options.statuses.map((s) => (
              <option key={s.code} value={s.code}>
                {label(s.label, locale)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary">
          {t("common.filter")}
        </button>
        <Link href="/turnarounds" className="btn">
          {t("common.reset")}
        </Link>
      </form>

      <div className="table-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t("turnarounds.cycleDate")}</th>
              <th>{t("common.trainNumber")}</th>
              <th>{t("common.locomotive")}</th>
              <th>{t("common.status")}</th>
              <th>{t("turnarounds.progress")}</th>
              <th>{t("common.elapsed")}</th>
              <th>{t("turnarounds.openedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-muted text-center">
                  {t("common.empty")}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const minutes =
                row.firstAt && row.lastAt
                  ? Math.round((new Date(row.lastAt).getTime() - new Date(row.firstAt).getTime()) / 60000)
                  : null;
              return (
                <RowLink key={row.id} href={`/turnarounds/${row.id}`}>
                  <td>
                    <Link href={`/turnarounds/${row.id}`} className="text-accent font-medium hover:underline">
                      {row.id}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{formatDate(row.cycleDate, locale)}</td>
                  <td className="font-medium">{row.trainNumber}</td>
                  <td>{row.locomotiveNumber ?? "—"}</td>
                  <td>
                    <StatusBadge code={row.statusCode} text={statusLabel.get(row.statusCode) ?? row.statusCode} />
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="bg-surface-muted h-1.5 w-16 overflow-hidden rounded-full">
                        <span
                          className={`block h-full rounded-full ${row.closedAt ? "bg-success" : "bg-accent"}`}
                          style={{ width: `${Math.min(100, Math.round((row.filled / totalOperations) * 100))}%` }}
                        />
                      </span>
                      <span className="tabular-nums">
                        {row.filled}/{totalOperations}
                      </span>
                    </div>
                  </td>
                  <td className="tabular-nums">
                    {minutes === null
                      ? "—"
                      : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`}
                  </td>
                  <td className="text-muted">{row.openedByName}</td>
                </RowLink>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

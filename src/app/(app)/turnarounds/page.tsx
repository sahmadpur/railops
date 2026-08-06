import { and, count, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { db } from "@/db";
import { locomotives, turnaroundOperations, turnarounds, users } from "@/db/schema";
import { getFormOptions } from "@/lib/catalogue";
import { formatDate, label } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function TurnaroundsPage({ searchParams }: PageProps<"/turnarounds">) {
  await requireSession();
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

  const filters: SQL[] = [];
  if (from) filters.push(gte(turnarounds.cycleDate, from));
  if (to) filters.push(lte(turnarounds.cycleDate, to));
  if (status) filters.push(eq(turnarounds.statusCode, status));
  if (locomotiveId) filters.push(eq(turnarounds.locomotiveId, Number(locomotiveId)));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: turnarounds.id,
      cycleDate: turnarounds.cycleDate,
      statusCode: turnarounds.statusCode,
      closedAt: turnarounds.closedAt,
      locomotiveNumber: locomotives.number,
      openedByName: users.fullName,
      filled: count(turnaroundOperations.id),
      firstAt: sql<Date | null>`min(${turnaroundOperations.occurredAt})`,
      lastAt: sql<Date | null>`max(${turnaroundOperations.occurredAt})`,
    })
    .from(turnarounds)
    .innerJoin(locomotives, eq(locomotives.id, turnarounds.locomotiveId))
    .innerJoin(users, eq(users.id, turnarounds.openedBy))
    .leftJoin(turnaroundOperations, eq(turnaroundOperations.turnaroundId, turnarounds.id))
    .where(where)
    .groupBy(turnarounds.id, locomotives.number, users.fullName)
    .orderBy(desc(turnarounds.cycleDate), desc(turnarounds.id))
    .limit(200);

  const totalOperations = options.catalogue.filter((o) => o.isActive).length;
  const statusLabel = new Map(options.statuses.map((s) => [s.code, label(s.label, locale)]));
  const exportParams = new URLSearchParams(
    Object.entries({ from, to, status, locomotiveId }).filter(([, v]) => v) as [string, string][],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t("turnarounds.title")}</h1>
        <div className="flex gap-2">
          <a href={`/api/export/turnarounds?${exportParams}`} className="btn text-xs">
            {t("common.exportExcel")}
          </a>
          <Link href="/turnarounds/new" className="btn btn-primary text-xs">
            {t("turnarounds.new")}
          </Link>
        </div>
      </div>

      <form className="border-line bg-surface flex flex-wrap items-end gap-2 rounded border p-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.from")}</span>
          <input type="date" name="from" defaultValue={from} className="field w-auto" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.to")}</span>
          <input type="date" name="to" defaultValue={to} className="field w-auto" />
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

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t("turnarounds.cycleDate")}</th>
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
                <td colSpan={7} className="text-muted text-center">
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
                <tr key={row.id}>
                  <td>
                    <Link href={`/turnarounds/${row.id}`} className="text-accent hover:underline">
                      {row.id}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{formatDate(row.cycleDate, locale)}</td>
                  <td>{row.locomotiveNumber}</td>
                  <td>{statusLabel.get(row.statusCode) ?? row.statusCode}</td>
                  <td className="tabular-nums">
                    {row.filled}/{totalOperations}
                  </td>
                  <td className="tabular-nums">
                    {minutes === null
                      ? "—"
                      : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`}
                  </td>
                  <td className="text-muted">{row.openedByName}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

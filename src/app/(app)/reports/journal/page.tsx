import { getLocale, getTranslations } from "next-intl/server";

import { getActiveLocomotives, getStations } from "@/lib/catalogue";
import { buildJournal } from "@/lib/journal";
import { label, monthLabel } from "@/lib/format";
import { requireSession } from "@/lib/session";

import PrintButton from "./PrintButton";

export default async function JournalPage({ searchParams }: PageProps<"/reports/journal">) {
  await requireSession();
  const [t, locale, query] = await Promise.all([getTranslations(), getLocale(), searchParams]);

  const now = new Date();
  const monthValue =
    typeof query.month === "string" && /^\d{4}-\d{2}$/.test(query.month)
      ? query.month
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, month] = monthValue.split("-").map(Number);
  const locomotiveId = typeof query.locomotiveId === "string" && query.locomotiveId ? Number(query.locomotiveId) : undefined;

  const [journal, stationRows, locomotiveRows] = await Promise.all([
    buildJournal(year, month, locomotiveId),
    getStations(),
    getActiveLocomotives(),
  ]);

  const stationName = new Map(stationRows.map((s) => [s.id, label(s.name, locale)]));
  const corridor = stationRows.map((s) => label(s.name, locale)).join(" → ");
  const exportParams = new URLSearchParams({ month: monthValue, ...(locomotiveId ? { locomotiveId: String(locomotiveId) } : {}) });

  return (
    <div className="space-y-3">
      <form className="border-line bg-surface no-print flex flex-wrap items-end gap-2 rounded border p-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.month")}</span>
          <input type="month" name="month" defaultValue={monthValue} className="field w-auto" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.locomotive")}</span>
          <select name="locomotiveId" defaultValue={locomotiveId ?? ""} className="field w-auto">
            <option value="">{t("common.all")}</option>
            {locomotiveRows.map((l) => (
              <option key={l.id} value={l.id}>
                {l.number}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary">
          {t("common.filter")}
        </button>
        <a href={`/api/export/journal?${exportParams}`} className="btn">
          {t("common.exportExcel")}
        </a>
        <PrintButton text={t("common.print")} />
      </form>

      <header>
        <h1 className="text-center text-sm font-semibold uppercase">{t("journal.heading")}</h1>
        <p className="text-muted text-center text-xs">
          {t("journal.subheading", { station: corridor, month: monthLabel(year, month, locale) })}
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="data-table text-xs">
          <thead>
            <tr>
              <th className="w-8">№</th>
              <th className="min-w-[240px]">{t("journal.operationColumn")}</th>
              <th>{t("common.station")}</th>
              {journal.columns.map((column) => (
                <th key={column.turnaroundId} className="whitespace-nowrap text-center">
                  <div>{Number(column.cycleDate.slice(8, 10))}</div>
                  <div className="text-muted font-normal">{column.locomotiveNumber}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {journal.operations.map((operation) => (
              <tr key={operation.id}>
                <td className="text-muted text-center tabular-nums">{operation.seq}</td>
                <td>{label(operation.label as never, locale)}</td>
                <td className="text-muted whitespace-nowrap">{stationName.get(operation.stationId) ?? "—"}</td>
                {journal.columns.map((column) => (
                  <td key={column.turnaroundId} className="text-center tabular-nums">
                    {column.times.get(operation.id) ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="font-semibold">
              <td />
              <td colSpan={2}>{t("journal.totalRow")}</td>
              {journal.columns.map((column) => (
                <td key={column.turnaroundId} className="text-center tabular-nums">
                  {column.elapsed}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {journal.columns.length === 0 && <p className="text-muted text-xs">{t("common.empty")}</p>}
      <p className="text-muted text-[11px]">{t("journal.footnote")}</p>
    </div>
  );
}

import ExcelJS from "exceljs";
import { getLocale, getTranslations } from "next-intl/server";

import { getStations } from "@/lib/catalogue";
import { buildJournal } from "@/lib/journal";
import { label, monthLabel } from "@/lib/format";
import { getSession } from "@/lib/session";

/** Reproduces the source workbook's layout: operations down the side, one column per turnaround. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.role !== "admin") return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month") ?? "";
  const now = new Date();
  const [year, month] = /^\d{4}-\d{2}$/.test(monthParam)
    ? monthParam.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const locomotiveId = url.searchParams.get("locomotiveId");

  const [t, locale, journal, stationRows] = await Promise.all([
    getTranslations(),
    getLocale(),
    buildJournal(year, month, locomotiveId ? Number(locomotiveId) : undefined),
    getStations(),
  ]);
  const stationName = new Map(stationRows.map((s) => [s.id, label(s.name, locale)]));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(monthLabel(year, month, locale));

  const width = 3 + journal.columns.length;
  sheet.mergeCells(1, 1, 1, width);
  sheet.getCell(1, 1).value = t("journal.heading");
  sheet.getCell(1, 1).font = { bold: true };
  sheet.mergeCells(2, 1, 2, width);
  sheet.getCell(2, 1).value = t("journal.subheading", {
    station: stationRows.map((s) => label(s.name, locale)).join(" → "),
    month: monthLabel(year, month, locale),
  });

  const header = sheet.getRow(4);
  header.values = [
    "№",
    t("journal.operationColumn"),
    t("common.station"),
    ...journal.columns.map(
      (c) => `${Number(c.cycleDate.slice(8, 10))} · ${c.trainNumber} · ${c.locomotiveNumber ?? "—"}`,
    ),
  ];
  header.font = { bold: true };

  journal.operations.forEach((operation, index) => {
    sheet.getRow(5 + index).values = [
      operation.seq,
      label(operation.label as never, locale),
      stationName.get(operation.stationId) ?? "",
      ...journal.columns.map((c) => c.times.get(operation.id) ?? ""),
    ];
  });

  const totalRow = sheet.getRow(5 + journal.operations.length);
  totalRow.values = ["", t("journal.totalRow"), "", ...journal.columns.map((c) => c.elapsed)];
  totalRow.font = { bold: true };

  sheet.getColumn(1).width = 5;
  sheet.getColumn(2).width = 52;
  sheet.getColumn(3).width = 16;
  for (let i = 0; i < journal.columns.length; i += 1) sheet.getColumn(4 + i).width = 11;
  sheet.views = [{ state: "frozen", xSplit: 3, ySplit: 4 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="railops-journal-${year}-${String(month).padStart(2, "0")}.xlsx"`,
    },
  });
}

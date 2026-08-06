import ExcelJS from "exceljs";
import { and, asc, count, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";

import { db } from "@/db";
import { locomotives, turnaroundOperations, turnarounds, users } from "@/db/schema";
import { getReference } from "@/lib/catalogue";
import { formatDate, label } from "@/lib/format";
import { getSession } from "@/lib/session";
import { formatElapsed } from "@/lib/turnaround-rules";

/** The filtered turnaround list, exactly as the screen shows it. */
export async function GET(request: Request) {
  if (!(await getSession())) return new Response("Unauthorized", { status: 401 });

  const params = new URL(request.url).searchParams;
  const filters: SQL[] = [];
  const from = params.get("from");
  const to = params.get("to");
  const status = params.get("status");
  const locomotiveId = params.get("locomotiveId");
  if (from) filters.push(gte(turnarounds.cycleDate, from));
  if (to) filters.push(lte(turnarounds.cycleDate, to));
  if (status) filters.push(eq(turnarounds.statusCode, status));
  if (locomotiveId) filters.push(eq(turnarounds.locomotiveId, Number(locomotiveId)));

  const [t, locale, statuses, rows] = await Promise.all([
    getTranslations(),
    getLocale(),
    getReference("turnaround_status"),
    db
      .select({
        id: turnarounds.id,
        cycleDate: turnarounds.cycleDate,
        statusCode: turnarounds.statusCode,
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
      .where(filters.length ? and(...filters) : undefined)
      .groupBy(turnarounds.id, locomotives.number, users.fullName)
      .orderBy(desc(turnarounds.cycleDate), asc(turnarounds.id)),
  ]);

  const statusLabel = new Map(statuses.map((s) => [s.code, label(s.label, locale)]));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t("turnarounds.title"));
  sheet.columns = [
    { header: "#", key: "id", width: 8 },
    { header: t("turnarounds.cycleDate"), key: "date", width: 14 },
    { header: t("common.locomotive"), key: "loco", width: 16 },
    { header: t("common.status"), key: "status", width: 16 },
    { header: t("turnarounds.progress"), key: "filled", width: 12 },
    { header: t("common.elapsed"), key: "elapsed", width: 12 },
    { header: t("turnarounds.openedBy"), key: "openedBy", width: 26 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const minutes =
      row.firstAt && row.lastAt
        ? Math.round((new Date(row.lastAt).getTime() - new Date(row.firstAt).getTime()) / 60000)
        : null;
    sheet.addRow({
      id: row.id,
      date: formatDate(row.cycleDate, locale),
      loco: row.locomotiveNumber,
      status: statusLabel.get(row.statusCode) ?? row.statusCode,
      filled: row.filled,
      elapsed: formatElapsed(minutes),
      openedBy: row.openedByName,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="railops-turnarounds.xlsx"`,
    },
  });
}

import ExcelJS from "exceljs";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";

import { db } from "@/db";
import { locomotives, trainNumbers, turnaroundOperations, turnarounds, users } from "@/db/schema";
import { getReference } from "@/lib/catalogue";
import { formatDate, label } from "@/lib/format";
import { getSession } from "@/lib/session";
import { turnaroundFilters } from "@/lib/turnaround-filters";
import { formatElapsed } from "@/lib/turnaround-rules";

/** The filtered turnaround list, exactly as the screen shows it. Admin-only: the operator list
    is station-scoped and this export is not. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.role !== "admin") return new Response("Forbidden", { status: 403 });

  const params = new URL(request.url).searchParams;
  const filters = turnaroundFilters({
    from: params.get("from"),
    to: params.get("to"),
    status: params.get("status"),
    locomotiveId: params.get("locomotiveId"),
    trainNumberId: params.get("trainNumberId"),
    q: params.get("q")?.trim(),
  });

  const [t, locale, statuses, rows] = await Promise.all([
    getTranslations(),
    getLocale(),
    getReference("turnaround_status"),
    db
      .select({
        id: turnarounds.id,
        cycleDate: turnarounds.cycleDate,
        statusCode: turnarounds.statusCode,
        trainNumber: trainNumbers.number,
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
      .where(filters.length ? and(...filters) : undefined)
      .groupBy(turnarounds.id, trainNumbers.number, locomotives.number, users.fullName)
      .orderBy(desc(turnarounds.cycleDate), asc(turnarounds.id)),
  ]);

  const statusLabel = new Map(statuses.map((s) => [s.code, label(s.label, locale)]));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t("turnarounds.title"));
  sheet.columns = [
    { header: "#", key: "id", width: 8 },
    { header: t("turnarounds.cycleDate"), key: "date", width: 14 },
    { header: t("common.trainNumber"), key: "train", width: 14 },
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
      train: row.trainNumber,
      loco: row.locomotiveNumber ?? "—",
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

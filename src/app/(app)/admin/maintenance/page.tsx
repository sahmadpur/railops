import { desc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { markMaintenanceReturned, saveMaintenance } from "@/actions/registry";
import ActionForm from "@/components/ActionForm";
import { db } from "@/db";
import { locomotives, maintenanceRecords } from "@/db/schema";
import { getActiveLocomotives, getReference } from "@/lib/catalogue";
import { formatDateTime, label, toLocalInputValue } from "@/lib/format";

export default async function AdminMaintenancePage() {
  const [t, locale, locomotiveRows, types, reasons, rows] = await Promise.all([
    getTranslations(),
    getLocale(),
    getActiveLocomotives(),
    getReference("maintenance_type"),
    getReference("maintenance_reason"),
    db
      .select({
        id: maintenanceRecords.id,
        locomotiveId: maintenanceRecords.locomotiveId,
        number: locomotives.number,
        turnaroundId: maintenanceRecords.turnaroundId,
        typeCode: maintenanceRecords.typeCode,
        reasonCode: maintenanceRecords.reasonCode,
        sentAt: maintenanceRecords.sentAt,
        returnedAt: maintenanceRecords.returnedAt,
        note: maintenanceRecords.note,
      })
      .from(maintenanceRecords)
      .innerJoin(locomotives, eq(locomotives.id, maintenanceRecords.locomotiveId))
      .orderBy(desc(maintenanceRecords.sentAt))
      .limit(200),
  ]);

  const messages = { saved: t("common.saved"), duplicate: t("errors.duplicate"), generic: t("errors.generic") };
  const typeLabel = new Map(types.map((r) => [r.code, label(r.label, locale)]));
  const reasonLabel = new Map(reasons.map((r) => [r.code, label(r.label, locale)]));

  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("admin.maintenance.title")}</h1>

      <ActionForm
        action={saveMaintenance}
        submitText={t("common.create")}
        messages={messages}
        className="filter-bar"
      >
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.locomotive")}</span>
          <select name="locomotiveId" required defaultValue="" className="field w-auto">
            <option value="" disabled>
              —
            </option>
            {locomotiveRows.map((l) => (
              <option key={l.id} value={l.id}>
                {l.number}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.maintenance.type")}</span>
          <select name="typeCode" defaultValue="" className="field w-auto">
            <option value="">—</option>
            {types.map((r) => (
              <option key={r.code} value={r.code}>
                {label(r.label, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.reason")}</span>
          <select name="reasonCode" defaultValue="" className="field w-auto">
            <option value="">—</option>
            {reasons.map((r) => (
              <option key={r.code} value={r.code}>
                {label(r.label, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.maintenance.sentAt")}</span>
          <input type="datetime-local" name="sentAt" required className="field w-auto" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.maintenance.returnedAt")}</span>
          <input type="datetime-local" name="returnedAt" className="field w-auto" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.note")}</span>
          <input name="note" className="field w-40" />
        </label>
      </ActionForm>

      <div className="table-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("common.locomotive")}</th>
              <th>{t("admin.maintenance.type")}</th>
              <th>{t("common.reason")}</th>
              <th>{t("admin.maintenance.sentAt")}</th>
              <th>{t("admin.maintenance.returnedAt")}</th>
              <th>{t("nav.turnarounds")}</th>
              <th>{t("common.actions")}</th>
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
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.number}</td>
                <td>{row.typeCode ? (typeLabel.get(row.typeCode) ?? row.typeCode) : "—"}</td>
                <td>{row.reasonCode ? (reasonLabel.get(row.reasonCode) ?? row.reasonCode) : "—"}</td>
                <td className="whitespace-nowrap">{formatDateTime(row.sentAt, locale)}</td>
                <td className="whitespace-nowrap">
                  {row.returnedAt ? formatDateTime(row.returnedAt, locale) : <span className="badge badge-warning">{t("admin.maintenance.open")}</span>}
                </td>
                <td>
                  {row.turnaroundId ? (
                    <Link href={`/turnarounds/${row.turnaroundId}`} className="text-accent hover:underline">
                      #{row.turnaroundId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap">
                  {row.returnedAt ? (
                    <ActionForm
                      action={saveMaintenance}
                      submitText={t("common.save")}
                      messages={messages}
                      compact
                      className="flex items-center gap-1"
                    >
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="typeCode" value={row.typeCode ?? ""} />
                      <input type="hidden" name="reasonCode" value={row.reasonCode ?? ""} />
                      <input type="hidden" name="note" value={row.note ?? ""} />
                      <input type="hidden" name="sentAt" value={toLocalInputValue(row.sentAt)} />
                      <input
                        type="datetime-local"
                        name="returnedAt"
                        defaultValue={toLocalInputValue(row.returnedAt)}
                        className="field w-auto"
                      />
                    </ActionForm>
                  ) : (
                    <ActionForm
                      action={markMaintenanceReturned}
                      submitText={t("admin.maintenance.markReturned")}
                      messages={messages}
                      compact
                    >
                      <input type="hidden" name="id" value={row.id} />
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

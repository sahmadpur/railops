import { asc } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";

import { deleteRow, saveLocomotive } from "@/actions/registry";
import ActionForm from "@/components/ActionForm";
import DeleteButton from "@/components/DeleteButton";
import { db } from "@/db";
import { locomotives } from "@/db/schema";
import { getStations } from "@/lib/catalogue";
import { label } from "@/lib/format";

export default async function AdminLocomotivesPage() {
  const [t, locale, stationRows, rows] = await Promise.all([
    getTranslations(),
    getLocale(),
    getStations(),
    db.select().from(locomotives).orderBy(asc(locomotives.number)),
  ]);

  const messages = { saved: t("common.saved"), duplicate: t("errors.duplicate"), generic: t("errors.generic") };
  const deleteLabels = {
    delete: t("common.delete"),
    confirm: t("common.deleteConfirm"),
    inUse: t("errors.inUse"),
    generic: t("errors.generic"),
  };

  const stationSelect = (name: string, value: number | "" | null) => (
    <select name={name} defaultValue={value ?? ""} className="field w-auto">
      <option value="">—</option>
      {stationRows.map((s) => (
        <option key={s.id} value={s.id}>
          {label(s.name, locale)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("admin.locomotives.title")}</h1>

      <ActionForm
        action={saveLocomotive}
        submitText={t("admin.locomotives.create")}
        messages={messages}
        className="filter-bar"
      >
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.locomotives.number")}</span>
          <input name="number" required className="field w-40" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.locomotives.owner")}</span>
          <select name="owner" defaultValue="AZ" className="field w-auto">
            <option value="AZ">AZ</option>
            <option value="GR">GR</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.locomotives.depot")}</span>
          <input name="depot" className="field w-40" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.locomotives.currentStation")}</span>
          {stationSelect("currentStationId", "")}
        </label>
      </ActionForm>

      <div className="table-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("admin.locomotives.number")}</th>
              <th>{t("admin.locomotives.owner")}</th>
              <th>{t("admin.locomotives.depot")}</th>
              <th>{t("admin.locomotives.currentStation")}</th>
              <th>{t("common.status")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td colSpan={5} className="p-0">
                  <ActionForm
                    action={saveLocomotive}
                    submitText={t("common.save")}
                    messages={messages}
                    compact
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                  >
                    <input type="hidden" name="id" value={row.id} />
                    <input name="number" defaultValue={row.number} required className="field w-32" />
                    <select name="owner" defaultValue={row.owner} className="field w-auto">
                      <option value="AZ">AZ</option>
                      <option value="GR">GR</option>
                    </select>
                    <input name="depot" defaultValue={row.depot ?? ""} className="field w-36" />
                    {stationSelect("currentStationId", row.currentStationId)}
                    <select name="isActive" defaultValue={String(row.isActive)} className="field w-auto">
                      <option value="true">{t("common.active")}</option>
                      <option value="false">{t("common.inactive")}</option>
                    </select>
                  </ActionForm>
                </td>
                <td className="whitespace-nowrap">
                  <DeleteButton action={deleteRow} labels={deleteLabels}>
                    <input type="hidden" name="table" value="locomotives" />
                    <input type="hidden" name="id" value={row.id} />
                  </DeleteButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { saveTrainNumber } from "@/actions/registry";
import ActionForm from "@/components/ActionForm";
import { db } from "@/db";
import { trainNumbers } from "@/db/schema";

export default async function AdminTrainNumbersPage() {
  const [t, rows] = await Promise.all([
    getTranslations(),
    db.select().from(trainNumbers).orderBy(asc(trainNumbers.country), asc(trainNumbers.number)),
  ]);

  const messages = { saved: t("common.saved"), duplicate: t("errors.duplicate"), generic: t("errors.generic") };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("admin.trainNumbers.title")}</h1>

      <ActionForm
        action={saveTrainNumber}
        submitText={t("admin.trainNumbers.create")}
        messages={messages}
        className="border-line bg-surface flex flex-wrap items-end gap-2 rounded border p-3 text-xs"
      >
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.trainNumbers.number")}</span>
          <input name="number" required className="field w-32" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.trainNumbers.parity")}</span>
          <select name="parity" defaultValue="even" className="field w-auto">
            <option value="even">{t("admin.trainNumbers.even")}</option>
            <option value="odd">{t("admin.trainNumbers.odd")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.trainNumbers.country")}</span>
          <select name="country" defaultValue="AZ" className="field w-auto">
            <option value="AZ">AZ</option>
            <option value="GR">GR</option>
          </select>
        </label>
      </ActionForm>

      <table className="data-table text-xs">
        <thead>
          <tr>
            <th>{t("admin.trainNumbers.number")}</th>
            <th>{t("admin.trainNumbers.parity")}</th>
            <th>{t("admin.trainNumbers.country")}</th>
            <th>{t("common.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td colSpan={4} className="p-0">
                <ActionForm
                  action={saveTrainNumber}
                  submitText={t("common.save")}
                  messages={messages}
                  compact
                  className="flex flex-wrap items-center gap-2 px-2 py-1"
                >
                  <input type="hidden" name="id" value={row.id} />
                  <input name="number" defaultValue={row.number} required className="field w-28" />
                  <select name="parity" defaultValue={row.parity} className="field w-auto">
                    <option value="even">{t("admin.trainNumbers.even")}</option>
                    <option value="odd">{t("admin.trainNumbers.odd")}</option>
                  </select>
                  <select name="country" defaultValue={row.country} className="field w-auto">
                    <option value="AZ">AZ</option>
                    <option value="GR">GR</option>
                  </select>
                  <select name="isActive" defaultValue={String(row.isActive)} className="field w-auto">
                    <option value="true">{t("common.active")}</option>
                    <option value="false">{t("common.inactive")}</option>
                  </select>
                </ActionForm>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

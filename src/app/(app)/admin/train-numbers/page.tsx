import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { deleteRow, saveTrainNumber } from "@/actions/registry";
import ActionForm from "@/components/ActionForm";
import DeleteButton from "@/components/DeleteButton";
import RowForm from "@/components/RowForm";
import { db } from "@/db";
import { trainNumbers } from "@/db/schema";

export default async function AdminTrainNumbersPage() {
  const [t, rows] = await Promise.all([
    getTranslations(),
    db.select().from(trainNumbers).orderBy(asc(trainNumbers.country), asc(trainNumbers.number)),
  ]);

  const messages = { saved: t("common.saved"), duplicate: t("errors.duplicate"), generic: t("errors.generic") };
  const deleteLabels = {
    delete: t("common.delete"),
    confirm: t("common.deleteConfirm"),
    inUse: t("errors.inUse"),
    generic: t("errors.generic"),
  };

  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("admin.trainNumbers.title")}</h1>

      <ActionForm
        action={saveTrainNumber}
        submitText={t("admin.trainNumbers.create")}
        messages={messages}
        className="filter-bar"
      >
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.trainNumbers.number")}</span>
          <input name="number" required className="field w-32" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.trainNumbers.country")}</span>
          <select name="country" defaultValue="AZ" className="field w-auto">
            <option value="AZ">AZ</option>
            <option value="GR">GR</option>
          </select>
        </label>
      </ActionForm>

      <div className="table-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("admin.trainNumbers.number")}</th>
              <th>{t("admin.trainNumbers.parity")}</th>
              <th>{t("admin.trainNumbers.country")}</th>
              <th>{t("common.status")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const form = `train-number-${row.id}`;
              return (
                <tr key={row.id}>
                  <td>
                    <input name="number" form={form} defaultValue={row.number} required className="field w-28" />
                  </td>
                  {/* Derived from the number on save — shown, never chosen. */}
                  <td className="text-muted">
                    {t(row.parity === "even" ? "admin.trainNumbers.even" : "admin.trainNumbers.odd")}
                  </td>
                  <td>
                    <select name="country" form={form} defaultValue={row.country} className="field w-auto">
                      <option value="AZ">AZ</option>
                      <option value="GR">GR</option>
                    </select>
                  </td>
                  <td>
                    <select name="isActive" form={form} defaultValue={String(row.isActive)} className="field w-auto">
                      <option value="true">{t("common.active")}</option>
                      <option value="false">{t("common.inactive")}</option>
                    </select>
                  </td>
                  <RowForm
                    formId={form}
                    action={saveTrainNumber}
                    submitText={t("common.save")}
                    messages={messages}
                    hidden={{ id: row.id }}
                    actions={
                      <DeleteButton action={deleteRow} labels={deleteLabels}>
                        <input type="hidden" name="table" value="trainNumbers" />
                        <input type="hidden" name="id" value={row.id} />
                      </DeleteButton>
                    }
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

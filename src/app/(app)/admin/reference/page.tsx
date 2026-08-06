import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { deleteRow, saveReferenceValue } from "@/actions/registry";
import ActionForm from "@/components/ActionForm";
import DeleteButton from "@/components/DeleteButton";
import RowForm from "@/components/RowForm";
import { db } from "@/db";
import { referenceValues } from "@/db/schema";
import { locales } from "@/i18n/config";

const KINDS = ["maintenance_type", "maintenance_reason", "detach_reason", "turnaround_status"] as const;

export default async function AdminReferencePage() {
  const [t, rows] = await Promise.all([
    getTranslations(),
    db.select().from(referenceValues).orderBy(asc(referenceValues.kind), asc(referenceValues.sortOrder)),
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
      <h1 className="page-title">{t("admin.reference.title")}</h1>

      <ActionForm
        action={saveReferenceValue}
        submitText={t("admin.reference.create")}
        messages={messages}
        className="filter-bar"
      >
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.reference.kind")}</span>
          <select name="kind" defaultValue={KINDS[0]} className="field w-auto">
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`admin.reference.kinds.${kind}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.reference.code")}</span>
          <input name="code" required className="field w-28" />
        </label>
        {locales.map((locale) => (
          <label key={locale} className="flex flex-col gap-1">
            <span className="text-muted uppercase">{locale}</span>
            <input name={`label_${locale}`} required={locale === "az"} className="field w-36" />
          </label>
        ))}
      </ActionForm>

      {KINDS.map((kind) => {
        const kindRows = rows.filter((r) => r.kind === kind);
        return (
          <section key={kind} className="space-y-1">
            <h2 className="card-title">{t(`admin.reference.kinds.${kind}`)}</h2>
            <div className="table-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-28">{t("admin.reference.code")}</th>
                    <th>{t("admin.reference.label")}</th>
                    <th>{t("common.status")}</th>
                    <th className="w-32">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {kindRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-muted text-center">
                        {t("common.empty")}
                      </td>
                    </tr>
                  )}
                  {kindRows.map((row) => {
                    const form = `reference-${row.id}`;
                    return (
                      <tr key={row.id}>
                        <td>
                          <input name="code" form={form} defaultValue={row.code} required className="field w-24" />
                        </td>
                        {/* One cell, one input per locale — the four translations are one value. */}
                        <td>
                          <div className="flex flex-wrap gap-2">
                            {locales.map((locale) => (
                              <input
                                key={locale}
                                name={`label_${locale}`}
                                form={form}
                                defaultValue={row.label[locale] ?? ""}
                                aria-label={locale}
                                className="field w-36"
                              />
                            ))}
                          </div>
                        </td>
                        <td>
                          <select
                            name="isActive"
                            form={form}
                            defaultValue={String(row.isActive)}
                            className="field w-auto"
                          >
                            <option value="true">{t("common.active")}</option>
                            <option value="false">{t("common.inactive")}</option>
                          </select>
                        </td>
                        <RowForm
                          formId={form}
                          action={saveReferenceValue}
                          submitText={t("common.save")}
                          messages={messages}
                          hidden={{ id: row.id, kind: row.kind }}
                          actions={
                            <DeleteButton action={deleteRow} labels={deleteLabels}>
                              <input type="hidden" name="table" value="referenceValues" />
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
          </section>
        );
      })}
    </div>
  );
}

import { getLocale, getTranslations } from "next-intl/server";

import { saveOperationType } from "@/actions/registry";
import ActionForm from "@/components/ActionForm";
import { getCatalogue, getStations } from "@/lib/catalogue";
import { label } from "@/lib/format";
import { locales } from "@/i18n/config";

export default async function AdminOperationsPage() {
  const [t, locale, catalogue, stationRows] = await Promise.all([
    getTranslations(),
    getLocale(),
    getCatalogue(),
    getStations(),
  ]);

  const messages = { saved: t("common.saved"), duplicate: t("errors.duplicate"), generic: t("errors.generic") };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="page-title">{t("admin.operations.title")}</h1>
        <p className="text-muted text-xs">{t("admin.operations.hint")}</p>
      </div>

      <div className="table-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8">{t("admin.operations.seq")}</th>
              <th>{t("admin.operations.operation")}</th>
              <th className="w-20">{t("admin.operations.fields")}</th>
            </tr>
          </thead>
          <tbody>
            {catalogue.map((operation) => (
              <tr key={operation.id}>
                <td className="text-center tabular-nums">{operation.seq}</td>
                <td className="p-0">
                  <ActionForm
                    action={saveOperationType}
                    submitText={t("common.save")}
                    messages={messages}
                    compact
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                  >
                    <input type="hidden" name="id" value={operation.id} />
                    {locales.map((code) => (
                      <input
                        key={code}
                        name={`label_${code}`}
                        defaultValue={operation.label[code] ?? ""}
                        aria-label={code}
                        className="field w-52"
                      />
                    ))}
                    <select name="stationId" defaultValue={operation.stationId} className="field w-auto">
                      {stationRows.map((s) => (
                        <option key={s.id} value={s.id}>
                          {label(s.name, locale)}
                        </option>
                      ))}
                    </select>
                    <select name="obligation" defaultValue={operation.obligation} className="field w-auto">
                      <option value="required">{t("common.required")}</option>
                      <option value="optional">{t("common.optional")}</option>
                      <option value="conditional">{t("common.conditional")}</option>
                    </select>
                    <label className="text-muted flex items-center gap-1">
                      {t("admin.operations.conditionalOn")}
                      <input
                        name="conditionalOnSeq"
                        type="number"
                        min={1}
                        defaultValue={operation.conditionalOnSeq ?? ""}
                        className="field w-16"
                      />
                    </label>
                    <label className="text-muted flex items-center gap-1">
                      {t("admin.operations.parallelWith")}
                      <input
                        name="parallelWithSeq"
                        type="number"
                        min={1}
                        defaultValue={operation.parallelWithSeq ?? ""}
                        className="field w-16"
                      />
                    </label>
                    <select name="isActive" defaultValue={String(operation.isActive)} className="field w-auto">
                      <option value="true">{t("common.active")}</option>
                      <option value="false">{t("common.inactive")}</option>
                    </select>
                  </ActionForm>
                </td>
                <td className="text-muted">
                  {operation.fields.length === 0 ? "—" : operation.fields.map((f) => t(`fields.${f}`)).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

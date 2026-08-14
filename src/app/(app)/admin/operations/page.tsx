import { getLocale, getTranslations } from "next-intl/server";

import { deleteRow, saveOperationType } from "@/actions/registry";
import ActionForm from "@/components/ActionForm";
import DeleteButton from "@/components/DeleteButton";
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
  const deleteLabels = {
    delete: t("common.delete"),
    confirm: t("common.deleteConfirm"),
    inUse: t("errors.inUse"),
    generic: t("errors.generic"),
  };

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
              <th className="w-32">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {catalogue.map((operation) => (
              <tr key={operation.id}>
                {/* Ordering key first: it is what the conditional/parallel inputs below refer to.
                    The sheet number rides along when the two have drifted apart. */}
                <td className="text-center tabular-nums">
                  {operation.seq}
                  {operation.displayNo && operation.displayNo !== String(operation.seq) && (
                    <span className="text-faint block text-[10px]">{operation.displayNo}</span>
                  )}
                </td>
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
                <td className="whitespace-nowrap">
                  <DeleteButton action={deleteRow} labels={deleteLabels}>
                    <input type="hidden" name="table" value="operationTypes" />
                    <input type="hidden" name="id" value={operation.id} />
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

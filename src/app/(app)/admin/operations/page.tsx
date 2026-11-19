import { getLocale, getTranslations } from "next-intl/server";
import { Fragment } from "react";

import { deleteRow, saveOperationType } from "@/actions/registry";
import ActionForm from "@/components/ActionForm";
import DeleteButton from "@/components/DeleteButton";
import { getAllStations, getCatalogue } from "@/lib/catalogue";
import { label, operationNo, routeLabel } from "@/lib/format";
import { locales } from "@/i18n/config";

export default async function AdminOperationsPage() {
  const [t, locale, catalogue, stationRows] = await Promise.all([
    getTranslations(),
    getLocale(),
    getCatalogue(),
    // Retired stations too: a retired operation still has to show the station it belonged to.
    getAllStations(),
  ]);

  // Steps taken off the route keep their rows only because older trains recorded them; their
  // number is parked at 10000+id. Listing them among the live steps reads as part of the route.
  const live = catalogue.filter((o) => o.isActive);
  const retired = catalogue.filter((o) => !o.isActive);
  const stationName = new Map(stationRows.map((s) => [s.id, label(s.name, locale)]));

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
            {live.map((operation, index) => (
              <Fragment key={operation.id}>
                {/* Each route numbers its own sequence; the conditional/parallel inputs refer
                    to numbers within the same route. */}
                {live[index - 1]?.route !== operation.route && (
                  <tr>
                    <th colSpan={4} className="bg-surface-muted text-start">
                      {t("turnarounds.route")}: {routeLabel(operation.route, stationRows, locale)}
                    </th>
                  </tr>
                )}
                <tr>
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
                      <label className="text-muted flex items-center gap-1">
                        <input name="endsRoute" type="checkbox" defaultChecked={operation.endsRoute} />
                        {t("admin.operations.endsRoute")}
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
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {retired.length > 0 && (
        <details className="table-card">
          <summary className="text-muted cursor-pointer px-4 py-3 text-sm">
            {t("admin.operations.retired", { count: retired.length })}
          </summary>
          <p className="text-faint px-4 pb-2 text-xs">{t("admin.operations.retiredHint")}</p>
          <table className="data-table">
            <tbody>
              {retired.map((operation) => (
                <tr key={operation.id}>
                  <td className="text-faint w-12 text-center tabular-nums">{operationNo(operation)}</td>
                  <td className="font-medium">{label(operation.label, locale)}</td>
                  <td className="text-muted">{stationName.get(operation.stationId) ?? "—"}</td>
                  <td className="text-muted whitespace-nowrap">{routeLabel(operation.route, stationRows, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

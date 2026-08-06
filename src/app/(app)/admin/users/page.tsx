import { asc, eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";

import { deleteRow, saveUser, toggleUser } from "@/actions/registry";
import ActionForm from "@/components/ActionForm";
import DeleteButton from "@/components/DeleteButton";
import { db } from "@/db";
import { stations, users } from "@/db/schema";
import { getStations } from "@/lib/catalogue";
import { label } from "@/lib/format";

export default async function AdminUsersPage() {
  const [t, locale, stationRows, rows] = await Promise.all([
    getTranslations(),
    getLocale(),
    getStations(),
    db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        stationId: users.stationId,
        isActive: users.isActive,
        stationName: stations.name,
      })
      .from(users)
      .leftJoin(stations, eq(stations.id, users.stationId))
      .orderBy(asc(users.fullName)),
  ]);

  const messages = {
    saved: t("common.saved"),
    duplicate: t("errors.duplicate"),
    stationRequired: t("admin.users.stationRequired"),
    generic: t("errors.generic"),
    forbidden: t("errors.forbidden"),
  };

  const deleteLabels = {
    delete: t("common.delete"),
    confirm: t("common.deleteConfirm"),
    inUse: t("errors.inUse"),
    generic: t("errors.generic"),
  };

  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("admin.users.title")}</h1>

      <ActionForm
        action={saveUser}
        submitText={t("admin.users.create")}
        messages={messages}
        className="filter-bar"
      >
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.users.fullName")}</span>
          <input name="fullName" required className="field w-48" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("login.email")}</span>
          <input name="email" type="email" required className="field w-56" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.users.role")}</span>
          <select name="role" defaultValue="operator" className="field w-auto">
            <option value="operator">{t("admin.users.operator")}</option>
            <option value="admin">{t("admin.users.admin")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("common.station")}</span>
          <select name="stationId" defaultValue="" className="field w-auto">
            <option value="">—</option>
            {stationRows.map((s) => (
              <option key={s.id} value={s.id}>
                {label(s.name, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.users.password")}</span>
          <input name="password" type="password" required className="field w-40" />
        </label>
      </ActionForm>

      <div className="table-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("admin.users.fullName")}</th>
              <th>{t("login.email")}</th>
              <th>{t("admin.users.role")}</th>
              <th>{t("common.station")}</th>
              <th>{t("admin.users.newPassword")}</th>
              <th>{t("common.status")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td colSpan={5} className="p-0">
                  <ActionForm
                    action={saveUser}
                    submitText={t("common.save")}
                    messages={messages}
                    compact
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                  >
                    <input type="hidden" name="id" value={row.id} />
                    <input name="fullName" defaultValue={row.fullName} required className="field w-44" />
                    <input name="email" type="email" defaultValue={row.email} required className="field w-52" />
                    <select name="role" defaultValue={row.role} className="field w-auto">
                      <option value="operator">{t("admin.users.operator")}</option>
                      <option value="admin">{t("admin.users.admin")}</option>
                    </select>
                    <select name="stationId" defaultValue={row.stationId ?? ""} className="field w-auto">
                      <option value="">—</option>
                      {stationRows.map((s) => (
                        <option key={s.id} value={s.id}>
                          {label(s.name, locale)}
                        </option>
                      ))}
                    </select>
                    <input
                      name="password"
                      type="password"
                      placeholder={t("admin.users.passwordHint")}
                      className="field w-52"
                    />
                  </ActionForm>
                </td>
                <td className="whitespace-nowrap">
                  <ActionForm
                    action={toggleUser}
                    submitText={row.isActive ? t("common.deactivate") : t("common.activate")}
                    messages={messages}
                    compact
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="isActive" value={row.isActive ? "false" : "true"} />
                    <span className={`badge ${row.isActive ? "badge-success" : ""}`}>
                      {row.isActive ? t("common.active") : t("common.inactive")}
                    </span>
                  </ActionForm>
                </td>
                <td className="whitespace-nowrap">
                  <DeleteButton action={deleteRow} labels={deleteLabels}>
                    <input type="hidden" name="table" value="users" />
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

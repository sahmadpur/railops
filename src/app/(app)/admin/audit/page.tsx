import { and, desc, eq, type SQL } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { deleteRow } from "@/actions/registry";
import DeleteButton from "@/components/DeleteButton";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { formatDateTime } from "@/lib/format";

const TABLES = [
  "turnarounds",
  "turnaround_operations",
  "maintenance_records",
  "locomotives",
  "train_numbers",
  "operation_types",
  "reference_values",
  "users",
  "stations",
];

/** Shows only the keys that actually changed — a full row dump is unreadable. */
function diff(before: unknown, after: unknown): string {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
  if (keys.length === 0) return "—";
  return keys
    .map((key) => `${key}: ${JSON.stringify(a[key]) ?? "∅"} → ${JSON.stringify(b[key]) ?? "∅"}`)
    .join("; ");
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const [t, locale, query] = await Promise.all([getTranslations(), getLocale(), searchParams]);
  const table = typeof query.table === "string" ? query.table : "";
  const rowId = typeof query.rowId === "string" ? query.rowId : "";

  const filters: SQL[] = [];
  if (table) filters.push(eq(auditLog.tableName, table));
  if (rowId) filters.push(eq(auditLog.rowId, rowId));

  const rows = await db
    .select({
      id: auditLog.id,
      tableName: auditLog.tableName,
      rowId: auditLog.rowId,
      action: auditLog.action,
      at: auditLog.at,
      before: auditLog.before,
      after: auditLog.after,
      actorName: users.fullName,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditLog.at))
    .limit(300);

  const actionText: Record<string, string> = {
    insert: t("admin.audit.insert"),
    update: t("admin.audit.update"),
    delete: t("admin.audit.delete"),
  };

  // Nothing audits the audit table itself, so a purged entry leaves no trace behind.
  const deleteLabels = {
    delete: t("common.delete"),
    confirm: t("admin.audit.deleteConfirm"),
    inUse: t("errors.inUse"),
    generic: t("errors.generic"),
  };

  return (
    <div className="space-y-3">
      <h1 className="page-title">{t("admin.audit.title")}</h1>

      <form className="filter-bar">
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.audit.table")}</span>
          <select name="table" defaultValue={table} className="field w-auto">
            <option value="">{t("common.all")}</option>
            {TABLES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">{t("admin.audit.row")}</span>
          <input name="rowId" defaultValue={rowId} className="field w-24" />
        </label>
        <button type="submit" className="btn btn-primary">
          {t("common.filter")}
        </button>
        <Link href="/admin/audit" className="btn">
          {t("common.reset")}
        </Link>
      </form>

      <div className="table-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("admin.audit.at")}</th>
              <th>{t("admin.audit.actor")}</th>
              <th>{t("admin.audit.table")}</th>
              <th>{t("admin.audit.row")}</th>
              <th>{t("admin.audit.action")}</th>
              <th className="min-w-[380px]">{t("admin.audit.changes")}</th>
              <th className="w-32">{t("common.actions")}</th>
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
                <td className="whitespace-nowrap">{formatDateTime(row.at, locale)}</td>
                <td>{row.actorName ?? "system"}</td>
                <td className="font-mono">{row.tableName}</td>
                <td className="tabular-nums">{row.rowId}</td>
                <td>{actionText[row.action] ?? row.action}</td>
                <td className="font-mono text-[11px] break-all">
                  {row.action === "update" ? diff(row.before, row.after) : row.action === "insert" ? "—" : "—"}
                </td>
                <td className="whitespace-nowrap">
                  <DeleteButton action={deleteRow} labels={deleteLabels}>
                    <input type="hidden" name="table" value="auditLog" />
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

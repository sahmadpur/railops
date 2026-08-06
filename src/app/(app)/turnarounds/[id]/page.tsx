import { eq, inArray } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { locomotives, turnaroundOperations, turnarounds, users, type OperationField } from "@/db/schema";
import { getFormOptions } from "@/lib/catalogue";
import { formatDate, label, toLocalInputValue } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { canEdit, elapsedMinutes, formatElapsed, missingForClose } from "@/lib/turnaround-rules";

import CloseControls from "./CloseControls";
import OperationRow, { type Option, type RowData, type RowLabels } from "./OperationRow";

export default async function TurnaroundDetailPage({ params }: PageProps<"/turnarounds/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const session = await requireSession();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  const [turnaround] = await db.select().from(turnarounds).where(eq(turnarounds.id, id)).limit(1);
  if (!turnaround) notFound();

  const [[locomotive], entries, options] = await Promise.all([
    db.select().from(locomotives).where(eq(locomotives.id, turnaround.locomotiveId)).limit(1),
    db.select().from(turnaroundOperations).where(eq(turnaroundOperations.turnaroundId, id)),
    getFormOptions(),
  ]);

  const recorderIds = [...new Set(entries.map((e) => e.recordedBy))];
  const recorders = recorderIds.length
    ? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, recorderIds))
    : [];
  const recorderName = new Map(recorders.map((r) => [r.id, r.fullName]));

  const stationName = new Map(options.stations.map((s) => [s.id, label(s.name, locale)]));
  const entryByOperation = new Map(entries.map((e) => [e.operationTypeId, e]));

  const trainOptions: Option[] = options.trainNumbers.map((n) => ({
    id: n.id,
    text: `${n.number} · ${n.country} · ${t(n.parity === "even" ? "admin.trainNumbers.even" : "admin.trainNumbers.odd")}`,
  }));
  const locomotiveOptions: Option[] = options.locomotives.map((l) => ({ id: l.id, text: `${l.number} · ${l.owner}` }));
  const referenceOptions = (rows: { code: string; label: Parameters<typeof label>[0] }[]): Option[] =>
    rows.map((r) => ({ id: r.code, text: label(r.label, locale) }));

  const fieldNames = {
    train_number: t("fields.train_number"),
    locomotive: t("fields.locomotive"),
    detach_reason: t("fields.detach_reason"),
    maintenance_reason: t("fields.maintenance_reason"),
    maintenance_type: t("fields.maintenance_type"),
  } satisfies Record<OperationField, string>;

  const labels: RowLabels = {
    save: t("common.save"),
    clear: t("common.clear"),
    saved: t("common.saved"),
    readOnly: t("turnarounds.notYourStation"),
    fieldNames,
    errors: {
      wrong_station: t("errors.wrong_station"),
      before_earlier_operation: t("errors.before_earlier_operation", { seq: "{seq}" }),
      after_later_operation: t("errors.after_later_operation", { seq: "{seq}" }),
      missing_field: t("errors.missing_field", { seq: "{seq}", field: "{field}" }),
      invalid_timestamp: t("errors.invalid_timestamp"),
      operation_inactive: t("errors.operation_inactive"),
      forbidden: t("errors.forbidden"),
      notFound: t("errors.notFound"),
      generic: t("errors.generic"),
    },
  };

  const isClosed = Boolean(turnaround.closedAt);
  const rows: RowData[] = options.catalogue
    .filter((o) => o.isActive)
    .map((operation) => {
      const entry = entryByOperation.get(operation.id);
      return {
        turnaroundId: id,
        operationTypeId: operation.id,
        seq: operation.seq,
        name: label(operation.label, locale),
        stationName: stationName.get(operation.stationId) ?? "—",
        obligation: operation.obligation,
        obligationText:
          operation.obligation === "required"
            ? t("common.required")
            : operation.obligation === "optional"
              ? t("common.optional")
              : `${t("common.conditional")} · ${t("admin.operations.conditionalOn")} ${operation.conditionalOnSeq ?? "—"}`,
        fields: operation.fields,
        editable: canEdit(session, operation) && (!isClosed || session.role === "admin"),
        occurredAtValue: toLocalInputValue(entry?.occurredAt ?? null),
        trainNumberId: entry?.trainNumberId ?? null,
        locomotiveId: entry?.locomotiveId ?? null,
        detachReasonCode: entry?.detachReasonCode ?? null,
        maintenanceReasonCode: entry?.maintenanceReasonCode ?? null,
        maintenanceTypeCode: entry?.maintenanceTypeCode ?? null,
        note: entry?.note ?? null,
        recordedByName: entry ? (recorderName.get(entry.recordedBy) ?? null) : null,
        options: {
          train_number: trainOptions,
          locomotive: locomotiveOptions,
          detach_reason: referenceOptions(options.detachReasons),
          maintenance_reason: referenceOptions(options.maintenanceReasons),
          maintenance_type: referenceOptions(options.maintenanceTypes),
        },
      };
    });

  const missing = missingForClose(
    options.catalogue,
    entries.map((e) => ({ operationTypeId: e.operationTypeId, occurredAt: e.occurredAt })),
  );
  const elapsed = elapsedMinutes(entries.map((e) => ({ operationTypeId: e.operationTypeId, occurredAt: e.occurredAt })));
  const statusLabel = options.statuses.find((s) => s.code === turnaround.statusCode);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/turnarounds" className="text-muted text-xs hover:underline">
            ← {t("turnarounds.title")}
          </Link>
          <h1 className="text-lg font-semibold">{t("turnarounds.detail", { id })}</h1>
          <p className="text-muted text-xs">
            {t("common.locomotive")}: <strong>{locomotive?.number ?? "—"}</strong> · {t("turnarounds.cycleDate")}:{" "}
            {formatDate(turnaround.cycleDate, locale)} · {t("common.status")}:{" "}
            {statusLabel ? label(statusLabel.label, locale) : turnaround.statusCode} · {t("common.elapsed")}:{" "}
            <strong className="tabular-nums">{formatElapsed(elapsed)}</strong>
          </p>
          <p className="text-muted text-xs">
            {t("turnarounds.operationsFilled", { filled: entries.length, total: rows.length })}
          </p>
        </div>

        <CloseControls
          turnaroundId={id}
          isAdmin={session.role === "admin"}
          isClosed={isClosed}
          missingCount={missing.length}
          labels={{
            close: t("turnarounds.close"),
            reopen: t("turnarounds.reopen"),
            closed: t("turnarounds.closed"),
            missing: t("turnarounds.missingOperations", { count: missing.length }),
            success: t("turnarounds.closeSuccess"),
            generic: t("errors.generic"),
            forbidden: t("errors.forbidden"),
          }}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8">{t("admin.operations.seq")}</th>
              <th className="min-w-[260px]">{t("admin.operations.operation")}</th>
              <th>{t("common.station")}</th>
              <th className="min-w-[320px]">{t("common.time")}</th>
              <th className="w-24">{t("common.actions")}</th>
              <th className="min-w-[140px]">{t("common.recordedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <OperationRow
                // React resets an uncontrolled form after its action resolves, which would
                // snap the selects back to their mount-time defaults. Keying on the saved
                // values remounts the row so it shows what is actually in the database.
                key={[
                  row.operationTypeId,
                  row.occurredAtValue,
                  row.trainNumberId,
                  row.locomotiveId,
                  row.detachReasonCode,
                  row.maintenanceReasonCode,
                  row.maintenanceTypeCode,
                  row.note,
                ].join("|")}
                row={row}
                labels={labels}
                // Rule above the row where the route hands over to the next station.
                newStationGroup={index > 0 && rows[index - 1].stationName !== row.stationName}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

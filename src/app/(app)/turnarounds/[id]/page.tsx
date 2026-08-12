import { eq, inArray } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import AutoRefresh from "@/components/AutoRefresh";
import StatusBadge from "@/components/StatusBadge";
import { db } from "@/db";
import { locomotives, trainNumbers, turnaroundOperations, turnarounds, users, type OperationField } from "@/db/schema";
import { getAvailableLocomotives, getFormOptions } from "@/lib/catalogue";
import { formatDate, label, toLocalInputValue } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { canEdit, editableWindow, elapsedMinutes, formatElapsed, missingForClose, unlockedIds } from "@/lib/turnaround-rules";

import CloseControls from "./CloseControls";
import CollapsedRows from "./CollapsedRows";
import OperationRow, { type Option, type RowData, type RowLabels } from "./OperationRow";

export default async function TurnaroundDetailPage({ params }: PageProps<"/turnarounds/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const session = await requireSession();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  const [turnaround] = await db.select().from(turnarounds).where(eq(turnarounds.id, id)).limit(1);
  if (!turnaround) notFound();

  const [[train], [locomotive], entries, options, available] = await Promise.all([
    db.select().from(trainNumbers).where(eq(trainNumbers.id, turnaround.trainNumberId)).limit(1),
    // Null until an attachment step records the locomotive.
    turnaround.locomotiveId
      ? db.select().from(locomotives).where(eq(locomotives.id, turnaround.locomotiveId)).limit(1)
      : [],
    db.select().from(turnaroundOperations).where(eq(turnaroundOperations.turnaroundId, id)),
    getFormOptions(),
    getAvailableLocomotives(id),
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
    text: `${n.number} · ${n.country}`,
  }));
  // Only free locomotives are offered, but one already recorded on this turnaround must keep
  // showing its value even if it has since gone busy elsewhere.
  const recordedLocomotiveIds = new Set(entries.map((e) => e.locomotiveId).filter((v) => v !== null));
  const availableIds = new Set(available.map((l) => l.id));
  const locomotiveOptions: Option[] = options.locomotives
    .filter((l) => availableIds.has(l.id) || recordedLocomotiveIds.has(l.id))
    .map((l) => ({ id: l.id, text: `${l.number} · ${l.owner}` }));
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
    saving: t("common.saving"),
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
      locked_operation: t("errors.locked_operation", { seq: "{seq}" }),
      locomotive_busy: t("errors.locomotive_busy"),
      past_leg: t("errors.past_leg"),
      clear_later_first: t("errors.clear_later_first", { seq: "{seq}" }),
      forbidden: t("errors.forbidden"),
      notFound: t("errors.notFound"),
      generic: t("errors.generic"),
    },
  };

  const isClosed = Boolean(turnaround.closedAt);
  // Anything recorded stays on the page, even a step since disabled in the catalogue — dropping
  // it would hide history and leave the counter describing rows that are not there.
  const belongs = options.catalogue.filter((o) => o.isActive || entryByOperation.has(o.id));
  // The turnaround is filled in order, so the form shows what is recorded plus the next step —
  // everything beyond it is not enterable yet and would only be noise.
  const entriesLike = entries.map((e) => ({ operationTypeId: e.operationTypeId, occurredAt: e.occurredAt }));
  const unlocked = unlockedIds(options.catalogue, entriesLike);
  // The leg the turnaround is on now. Earlier legs are collapsed and, for operators, read-only —
  // a Böyük Kəsik operator receiving the return leg must not touch the outbound one.
  const editWindow = editableWindow(options.catalogue, entriesLike);
  const rows: RowData[] = belongs
    .filter((o) => unlocked.has(o.id) || entryByOperation.has(o.id))
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
        editable:
          canEdit(session, operation) &&
          (session.role === "admin" || (editWindow !== null && operation.seq >= editWindow.fromSeq)) &&
          (!isClosed || session.role === "admin"),
        recorded: Boolean(entry),
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

  // Everything before the current leg is history: folded away, expandable on demand.
  const earlierRows = editWindow ? rows.filter((r) => r.seq < editWindow.fromSeq) : [];
  const currentRows = editWindow ? rows.filter((r) => r.seq >= editWindow.fromSeq) : rows;
  const renderRows = (group: RowData[]) =>
    group.map((row, index) => (
      // Keyed on the operation alone: React resets the uncontrolled form once the action
      // resolves, and by then this render has the saved values as its defaults. Keying on the
      // values too would remount the row and throw away the action result — which is what
      // shows the operator that the save landed.
      <OperationRow
        key={row.operationTypeId}
        row={row}
        labels={labels}
        // Rule above the row where the route hands over to the next station.
        newStationGroup={index > 0 && group[index - 1].stationName !== row.stationName}
      />
    ));

  const missing = missingForClose(options.catalogue, entriesLike);
  const elapsed = elapsedMinutes(entriesLike);
  const statusLabel = options.statuses.find((s) => s.code === turnaround.statusCode);

  return (
    <div className="space-y-5">
      <AutoRefresh />
      <div>
        <Link href="/turnarounds" className="text-muted text-xs hover:underline">
          ← {t("turnarounds.title")}
        </Link>
        <h1 className="page-title mt-1">{t("turnarounds.detail", { id })}</h1>
      </div>

      <div className="card card-pad flex flex-wrap items-start justify-between gap-6">
        <dl className="grid flex-1 grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          <div>
            <dt className="text-muted text-xs">{t("common.trainNumber")}</dt>
            <dd className="mt-0.5 font-medium">{train?.number ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("common.locomotive")}</dt>
            <dd className="mt-0.5 font-medium">{locomotive?.number ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("turnarounds.cycleDate")}</dt>
            <dd className="mt-0.5 font-medium">{formatDate(turnaround.cycleDate, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("common.status")}</dt>
            <dd className="mt-1">
              <StatusBadge
                code={turnaround.statusCode}
                text={statusLabel ? label(statusLabel.label, locale) : turnaround.statusCode}
              />
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("common.elapsed")}</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{formatElapsed(elapsed)}</dd>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <div className="text-muted mb-1.5 text-xs">
              {t("turnarounds.operationsFilled", { filled: entries.length, total: belongs.length })}
            </div>
            <div className="bg-surface-muted h-2 w-full max-w-md overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full ${isClosed ? "bg-success" : "bg-accent"}`}
                style={{ width: `${Math.round((entries.length / Math.max(1, belongs.length)) * 100)}%` }}
              />
            </div>
          </div>
        </dl>

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
            delete: t("common.delete"),
            deleteConfirm: t("turnarounds.deleteConfirm"),
          }}
        />
      </div>

      <div className="table-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8">{t("admin.operations.seq")}</th>
              <th className="min-w-[260px]">{t("admin.operations.operation")}</th>
              <th>{t("common.station")}</th>
              <th className="min-w-[260px]">{t("common.time")}</th>
              <th>{t("common.note")}</th>
              <th className="w-24">{t("common.actions")}</th>
              <th className="min-w-[140px]">{t("common.recordedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {earlierRows.length > 0 && (
              <CollapsedRows
                columns={7}
                showLabel={t("turnarounds.showEarlier", { count: earlierRows.length })}
                hideLabel={t("turnarounds.hideEarlier")}
              >
                {renderRows(earlierRows)}
              </CollapsedRows>
            )}
            {renderRows(currentRows)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

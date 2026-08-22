"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { withActor } from "@/db/actor";
import { maintenanceRecords, operationTypes, turnaroundOperations, turnarounds } from "@/db/schema";
import { getStations } from "@/lib/catalogue";
import {
  canEdit,
  checkClearable,
  checkCurrentLeg,
  checkUnlocked,
  currentTrainNumber,
  missingForClose,
  openingRule,
  parityOf,
  validateEntry,
  type EntryInput,
} from "@/lib/turnaround-rules";
import { requireSession } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string; seq?: number; field?: string };

function optionalInt(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : null;
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

async function loadContext(turnaroundId: number) {
  const [turnaround] = await db.select().from(turnarounds).where(eq(turnarounds.id, turnaroundId)).limit(1);
  if (!turnaround) return null;

  const [catalogue, entries] = await Promise.all([
    db.select().from(operationTypes).orderBy(asc(operationTypes.seq)),
    db.select().from(turnaroundOperations).where(eq(turnaroundOperations.turnaroundId, turnaroundId)),
  ]);

  return { turnaround, catalogue, entries };
}

export async function createTurnaround(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const trainNumber = optionalText(formData.get("trainNumber"));
  const cycleDate = optionalText(formData.get("cycleDate"));
  if (!trainNumber || !cycleDate) return { ok: false, error: "generic" };

  const stations = await getStations();
  const stationCode = stations.find((s) => s.id === session.stationId)?.code ?? null;
  const opening = openingRule(session.role, stationCode);
  if (!opening.allowed) return { ok: false, error: "forbidden" };
  // Böyük Kəsik opens even trains, Tbilisi odd ones; the number itself says which it is.
  if (opening.parity && parityOf(trainNumber) !== opening.parity) return { ok: false, error: "wrong_parity" };

  const created = await withActor(session.userId, async (tx) => {
    const [row] = await tx
      .insert(turnarounds)
      .values({ trainNumber, cycleDate, openedBy: session.userId, statusCode: "open" })
      .returning({ id: turnarounds.id });

    // The first step is the arrival that opens the turnaround, so it is recorded here rather
    // than typed again: its time is the moment of creation and its train is the one chosen.
    // Skipped when that step wants anything else, since there is nothing to fill it from.
    const [first] = await tx
      .select()
      .from(operationTypes)
      .where(eq(operationTypes.isActive, true))
      .orderBy(asc(operationTypes.seq))
      .limit(1);

    if (first && first.fields.every((f) => f === "train_number")) {
      await tx.insert(turnaroundOperations).values({
        turnaroundId: row.id,
        operationTypeId: first.id,
        occurredAt: new Date(),
        trainNumber: first.fields.includes("train_number") ? trainNumber : null,
        recordedBy: session.userId,
      });
      await tx.update(turnarounds).set({ statusCode: "in_progress" }).where(eq(turnarounds.id, row.id));
    }

    return row;
  });

  revalidatePath("/turnarounds");
  revalidatePath("/dashboard");
  redirect(`/turnarounds/${created.id}`);
}

/** Creates or updates one operation row, then mirrors ТОИР steps into the technical work registry. */
export async function saveOperation(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const turnaroundId = optionalInt(formData.get("turnaroundId"));
  const operationTypeId = optionalInt(formData.get("operationTypeId"));
  const occurredAtRaw = optionalText(formData.get("occurredAt"));
  if (!turnaroundId || !operationTypeId) return { ok: false, error: "generic" };

  const context = await loadContext(turnaroundId);
  if (!context) return { ok: false, error: "notFound" };
  if (context.turnaround.closedAt && session.role !== "admin") return { ok: false, error: "forbidden" };

  const operation = context.catalogue.find((o) => o.id === operationTypeId);
  if (!operation) return { ok: false, error: "notFound" };

  const input: EntryInput = {
    // The form prefills the current time, so a blank field means the operator submitted before
    // that landed (or with JavaScript off) — stamp it here rather than rejecting the entry.
    occurredAt: occurredAtRaw ? new Date(occurredAtRaw) : new Date(),
    trainNumber: optionalText(formData.get("trainNumber")),
    locomotiveId: optionalInt(formData.get("locomotiveId")),
    detachReasonCode: optionalText(formData.get("detachReasonCode")),
    maintenanceReasonCode: optionalText(formData.get("maintenanceReasonCode")),
    maintenanceTypeCode: optionalText(formData.get("maintenanceTypeCode")),
  };

  const failure =
    validateEntry(session, operation, input, context.catalogue, context.entries) ??
    checkUnlocked(operation, context.catalogue, context.entries);
  if (failure) return { ok: false, error: failure.code, seq: failure.seq, field: failure.field };

  const note = optionalText(formData.get("note"));

  // The train is renumbered along the route, so the turnaround carries whichever number was
  // assigned last — that is what the list, dashboard and export show. The per-step numbers stay
  // as they were recorded, so the row for every station is the history of the renumbering.
  const latestTrainNumber = currentTrainNumber(context.catalogue, [
    ...context.entries.filter((e) => e.operationTypeId !== operationTypeId),
    { operationTypeId, occurredAt: input.occurredAt, trainNumber: input.trainNumber ?? null },
  ]);
  const newTrainNumber =
    latestTrainNumber && latestTrainNumber !== context.turnaround.trainNumber ? latestTrainNumber : null;

  // The turnaround itself carries no locomotive until one is attached, so ТОИР falls back to
  // whatever an earlier step recorded.
  const maintenanceLocomotiveId =
    input.locomotiveId ??
    context.turnaround.locomotiveId ??
    context.entries.find((e) => e.locomotiveId)?.locomotiveId ??
    null;
  if (operation.maintenanceEffect && !maintenanceLocomotiveId) {
    return { ok: false, error: "missing_field", seq: operation.seq, field: "locomotive" };
  }

  await withActor(session.userId, async (tx) => {
    await tx
      .insert(turnaroundOperations)
      .values({
        turnaroundId,
        operationTypeId,
        occurredAt: input.occurredAt,
        trainNumber: input.trainNumber ?? null,
        locomotiveId: input.locomotiveId ?? null,
        detachReasonCode: input.detachReasonCode ?? null,
        maintenanceReasonCode: input.maintenanceReasonCode ?? null,
        maintenanceTypeCode: input.maintenanceTypeCode ?? null,
        note,
        recordedBy: session.userId,
      })
      .onConflictDoUpdate({
        target: [turnaroundOperations.turnaroundId, turnaroundOperations.operationTypeId],
        set: {
          occurredAt: input.occurredAt,
          trainNumber: input.trainNumber ?? null,
          locomotiveId: input.locomotiveId ?? null,
          detachReasonCode: input.detachReasonCode ?? null,
          maintenanceReasonCode: input.maintenanceReasonCode ?? null,
          maintenanceTypeCode: input.maintenanceTypeCode ?? null,
          note,
          recordedBy: session.userId,
          updatedAt: new Date(),
        },
      });

    if (operation.maintenanceEffect && maintenanceLocomotiveId) {
      await syncMaintenance(tx, {
        effect: operation.maintenanceEffect,
        turnaroundId,
        locomotiveId: maintenanceLocomotiveId,
        occurredAt: input.occurredAt,
        typeCode: input.maintenanceTypeCode ?? null,
        reasonCode: input.maintenanceReasonCode ?? null,
        actorId: session.userId,
      });
    }

    // An attachment step is what gives the turnaround its locomotive; the latest one wins.
    const attachedLocomotiveId = operation.fields.includes("locomotive") ? input.locomotiveId : null;
    if (attachedLocomotiveId || newTrainNumber || context.turnaround.statusCode === "open") {
      await tx
        .update(turnarounds)
        .set({
          ...(attachedLocomotiveId ? { locomotiveId: attachedLocomotiveId } : {}),
          ...(newTrainNumber ? { trainNumber: newTrainNumber } : {}),
          ...(context.turnaround.statusCode === "open" ? { statusCode: "in_progress" as const } : {}),
          updatedAt: new Date(),
        })
        .where(eq(turnarounds.id, turnaroundId));
    }
  });

  revalidatePath(`/turnarounds/${turnaroundId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports/journal");
  return { ok: true };
}

type Tx = Parameters<Parameters<typeof withActor>[1]>[0];

/**
 * A `send` step opens the technical work record; the matching `return` step closes the
 * still-open one for that locomotive. Re-saving a step updates in place rather than
 * stacking duplicates.
 */
async function syncMaintenance(
  tx: Tx,
  args: {
    effect: "send" | "return";
    turnaroundId: number;
    locomotiveId: number;
    occurredAt: Date;
    typeCode: string | null;
    reasonCode: string | null;
    actorId: number;
  },
) {
  const [open] = await tx
    .select()
    .from(maintenanceRecords)
    .where(
      and(
        eq(maintenanceRecords.locomotiveId, args.locomotiveId),
        eq(maintenanceRecords.turnaroundId, args.turnaroundId),
        isNull(maintenanceRecords.returnedAt),
      ),
    )
    .orderBy(asc(maintenanceRecords.sentAt))
    .limit(1);

  if (args.effect === "send") {
    if (open) {
      await tx
        .update(maintenanceRecords)
        .set({ sentAt: args.occurredAt, typeCode: args.typeCode, reasonCode: args.reasonCode })
        .where(eq(maintenanceRecords.id, open.id));
      return;
    }
    await tx.insert(maintenanceRecords).values({
      locomotiveId: args.locomotiveId,
      turnaroundId: args.turnaroundId,
      typeCode: args.typeCode,
      reasonCode: args.reasonCode,
      sentAt: args.occurredAt,
      createdBy: args.actorId,
    });
    return;
  }

  if (open) {
    await tx
      .update(maintenanceRecords)
      .set({ returnedAt: args.occurredAt, typeCode: args.typeCode ?? open.typeCode })
      .where(eq(maintenanceRecords.id, open.id));
  }
}

export async function clearOperation(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const turnaroundId = optionalInt(formData.get("turnaroundId"));
  const operationTypeId = optionalInt(formData.get("operationTypeId"));
  if (!turnaroundId || !operationTypeId) return { ok: false, error: "generic" };

  const context = await loadContext(turnaroundId);
  if (!context) return { ok: false, error: "notFound" };
  if (context.turnaround.closedAt && session.role !== "admin") return { ok: false, error: "forbidden" };

  const operation = context.catalogue.find((o) => o.id === operationTypeId);
  if (!operation) return { ok: false, error: "notFound" };
  if (!canEdit(session, operation)) return { ok: false, error: "wrong_station" };

  const pastLeg = checkCurrentLeg(session, operation, context.catalogue, context.entries);
  if (pastLeg) return { ok: false, error: pastLeg.code, seq: pastLeg.seq };

  const blocked = checkClearable(session, operation, context.catalogue, context.entries);
  if (blocked) return { ok: false, error: blocked.code, seq: blocked.seq };

  // Clearing the step that assigned the current number falls the turnaround back to the last
  // number still recorded on it.
  const remaining = context.entries.filter((e) => e.operationTypeId !== operationTypeId);
  const fallbackTrainNumber = currentTrainNumber(context.catalogue, remaining);

  await withActor(session.userId, async (tx) => {
    await tx
      .delete(turnaroundOperations)
      .where(
        and(
          eq(turnaroundOperations.turnaroundId, turnaroundId),
          eq(turnaroundOperations.operationTypeId, operationTypeId),
        ),
      );

    if (fallbackTrainNumber && fallbackTrainNumber !== context.turnaround.trainNumber) {
      await tx
        .update(turnarounds)
        .set({ trainNumber: fallbackTrainNumber, updatedAt: new Date() })
        .where(eq(turnarounds.id, turnaroundId));
    }
  });

  revalidatePath(`/turnarounds/${turnaroundId}`);
  revalidatePath("/turnarounds");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Removes a turnaround and its operations (`turnaround_operations` cascades). ТОИР records
 * survive with a null `turnaroundId`, and the audit triggers keep the before-image of every
 * deleted row.
 */
export async function deleteTurnaround(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== "admin") return { ok: false, error: "forbidden" };

  const turnaroundId = optionalInt(formData.get("turnaroundId"));
  if (!turnaroundId) return { ok: false, error: "generic" };

  await withActor(session.userId, (tx) => tx.delete(turnarounds).where(eq(turnarounds.id, turnaroundId)));

  revalidatePath("/turnarounds");
  revalidatePath("/dashboard");
  redirect("/turnarounds");
}

export async function closeTurnaround(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const turnaroundId = optionalInt(formData.get("turnaroundId"));
  if (!turnaroundId) return { ok: false, error: "generic" };

  const context = await loadContext(turnaroundId);
  if (!context) return { ok: false, error: "notFound" };

  // Anyone may close once nothing required is left — the check below is the real gate.
  const missing = missingForClose(context.catalogue, context.entries);
  if (missing.length > 0) return { ok: false, error: "missingOperations", seq: missing[0].seq };

  await withActor(session.userId, (tx) =>
    tx
      .update(turnarounds)
      .set({ statusCode: "completed", closedAt: new Date(), updatedAt: new Date() })
      .where(eq(turnarounds.id, turnaroundId)),
  );

  revalidatePath(`/turnarounds/${turnaroundId}`);
  revalidatePath("/turnarounds");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function reopenTurnaround(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== "admin") return { ok: false, error: "forbidden" };

  const turnaroundId = optionalInt(formData.get("turnaroundId"));
  if (!turnaroundId) return { ok: false, error: "generic" };

  await withActor(session.userId, (tx) =>
    tx
      .update(turnarounds)
      .set({ statusCode: "in_progress", closedAt: null, updatedAt: new Date() })
      .where(eq(turnarounds.id, turnaroundId)),
  );

  revalidatePath(`/turnarounds/${turnaroundId}`);
  revalidatePath("/turnarounds");
  return { ok: true };
}

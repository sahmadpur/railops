"use server";

import bcrypt from "bcryptjs";
import { eq, isNull, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { withActor } from "@/db/actor";
import { isForeignKeyViolation, isUniqueViolation } from "@/db/errors";
import {
  auditLog,
  locomotives,
  maintenanceRecords,
  operationTypes,
  referenceValues,
  users,
  type Localized,
} from "@/db/schema";
import { requireAdmin } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ok: ActionResult = { ok: true };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalNumber(formData: FormData, key: string): number | null {
  const value = text(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function localized(formData: FormData, prefix: string): Localized {
  return {
    az: text(formData, `${prefix}_az`),
    ru: text(formData, `${prefix}_ru`),
    en: text(formData, `${prefix}_en`),
    ka: text(formData, `${prefix}_ka`),
  };
}

function isDuplicate(error: unknown): boolean {
  return isUniqueViolation(error);
}

async function run(path: string, work: (actorId: number) => Promise<void>): Promise<ActionResult> {
  const session = await requireAdmin();
  try {
    await work(session.userId);
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, error: "duplicate" };
    // The database refuses to orphan a referenced row; say so instead of crashing.
    if (isForeignKeyViolation(error)) return { ok: false, error: "inUse" };
    throw error;
  }
  revalidatePath(path);
  return ok;
}

/* ---------- deletion ---------- */

/**
 * One delete action for every registry list. The table arrives as a form field, so it is
 * looked up in this map and never interpolated. Rows that are still referenced by turnaround
 * history come back as `inUse` — deactivating them is the working answer there.
 */
const DELETABLE = {
  locomotives,
  referenceValues,
  operationTypes,
  users,
  maintenanceRecords,
  auditLog,
} as const;

const DELETE_PATHS: Record<keyof typeof DELETABLE, string> = {
  locomotives: "/admin/locomotives",
  referenceValues: "/admin/reference",
  operationTypes: "/admin/operations",
  users: "/admin/users",
  maintenanceRecords: "/admin/maintenance",
  auditLog: "/admin/audit",
};

export async function deleteRow(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const id = optionalNumber(formData, "id");
  const key = text(formData, "table") as keyof typeof DELETABLE;
  const table = DELETABLE[key];
  if (!id || !table) return { ok: false, error: "generic" };

  return run(DELETE_PATHS[key], async (actorId) => {
    await withActor(actorId, (tx) => tx.delete(table).where(eq(table.id, id)));
  });
}

/* ---------- users ---------- */

export async function saveUser(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const id = optionalNumber(formData, "id");
  const email = text(formData, "email").toLowerCase();
  const fullName = text(formData, "fullName");
  const role = text(formData, "role") === "admin" ? "admin" : "operator";
  const stationId = optionalNumber(formData, "stationId");
  const password = text(formData, "password");

  if (!email || !fullName) return { ok: false, error: "generic" };
  if (role === "operator" && !stationId) return { ok: false, error: "stationRequired" };
  if (!id && !password) return { ok: false, error: "generic" };

  return run("/admin/users", async (actorId) => {
    await withActor(actorId, async (tx) => {
      if (id) {
        await tx
          .update(users)
          .set({
            email,
            fullName,
            role,
            stationId: role === "admin" ? null : stationId,
            ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
          })
          .where(eq(users.id, id));
        return;
      }
      await tx.insert(users).values({
        email,
        fullName,
        role,
        stationId: role === "admin" ? null : stationId,
        passwordHash: await bcrypt.hash(password, 10),
      });
    });
  });
}

/** Accounts are never deleted — the audit trail references them. */
export async function toggleUser(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const id = optionalNumber(formData, "id");
  const isActive = text(formData, "isActive") === "true";
  if (!id) return { ok: false, error: "generic" };

  return run("/admin/users", async (actorId) => {
    await withActor(actorId, (tx) => tx.update(users).set({ isActive }).where(eq(users.id, id)));
  });
}

/* ---------- locomotives ---------- */

export async function saveLocomotive(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const id = optionalNumber(formData, "id");
  const number = text(formData, "number");
  const owner = text(formData, "owner") === "GR" ? "GR" : "AZ";
  const depot = text(formData, "depot") || null;
  const currentStationId = optionalNumber(formData, "currentStationId");
  const isActive = text(formData, "isActive") !== "false";
  if (!number) return { ok: false, error: "generic" };

  return run("/admin/locomotives", async (actorId) => {
    await withActor(actorId, (tx) =>
      id
        ? tx.update(locomotives).set({ number, owner, depot, currentStationId, isActive }).where(eq(locomotives.id, id))
        : tx.insert(locomotives).values({ number, owner, depot, currentStationId, isActive }),
    );
  });
}

/* ---------- reference values ---------- */

export async function saveReferenceValue(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const id = optionalNumber(formData, "id");
  const kind = text(formData, "kind");
  const code = text(formData, "code");
  const label = localized(formData, "label");
  const isActive = text(formData, "isActive") !== "false";
  if (!kind || !code || !label.az) return { ok: false, error: "generic" };

  return run("/admin/reference", async (actorId) => {
    await withActor(actorId, (tx) =>
      id
        ? tx.update(referenceValues).set({ kind, code, label, isActive }).where(eq(referenceValues.id, id))
        : tx.insert(referenceValues).values({ kind, code, label, isActive }),
    );
  });
}

/* ---------- operation catalogue ---------- */

export async function saveOperationType(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const id = optionalNumber(formData, "id");
  if (!id) return { ok: false, error: "generic" };

  const obligationRaw = text(formData, "obligation");
  const obligation =
    obligationRaw === "optional" ? "optional" : obligationRaw === "conditional" ? "conditional" : "required";
  const stationId = optionalNumber(formData, "stationId");
  if (!stationId) return { ok: false, error: "generic" };

  return run("/admin/operations", async (actorId) => {
    await withActor(actorId, (tx) =>
      tx
        .update(operationTypes)
        .set({
          label: localized(formData, "label"),
          stationId,
          obligation,
          conditionalOnSeq: obligation === "conditional" ? optionalNumber(formData, "conditionalOnSeq") : null,
          parallelWithSeq: optionalNumber(formData, "parallelWithSeq"),
          isActive: text(formData, "isActive") !== "false",
        })
        .where(eq(operationTypes.id, id)),
    );
  });
}

/* ---------- technical work ---------- */

export async function saveMaintenance(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const id = optionalNumber(formData, "id");
  const locomotiveId = optionalNumber(formData, "locomotiveId");
  const sentAt = text(formData, "sentAt");
  const returnedAt = text(formData, "returnedAt");
  const typeCode = text(formData, "typeCode") || null;
  const reasonCode = text(formData, "reasonCode") || null;
  const note = text(formData, "note") || null;

  if (!id && (!locomotiveId || !sentAt)) return { ok: false, error: "generic" };

  return run("/admin/maintenance", async (actorId) => {
    await withActor(actorId, (tx) =>
      id
        ? tx
            .update(maintenanceRecords)
            .set({
              typeCode,
              reasonCode,
              note,
              ...(sentAt ? { sentAt: new Date(sentAt) } : {}),
              returnedAt: returnedAt ? new Date(returnedAt) : null,
            })
            .where(eq(maintenanceRecords.id, id))
        : tx.insert(maintenanceRecords).values({
            locomotiveId: locomotiveId!,
            typeCode,
            reasonCode,
            note,
            sentAt: new Date(sentAt),
            returnedAt: returnedAt ? new Date(returnedAt) : null,
            createdBy: actorId,
          }),
    );
  });
}

/** Closes the oldest still-open record for a locomotive — the common desk action. */
export async function markMaintenanceReturned(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = optionalNumber(formData, "id");
  if (!id) return { ok: false, error: "generic" };

  return run("/admin/maintenance", async (actorId) => {
    await withActor(actorId, (tx) =>
      tx
        .update(maintenanceRecords)
        .set({ returnedAt: new Date() })
        .where(and(eq(maintenanceRecords.id, id), isNull(maintenanceRecords.returnedAt))),
    );
  });
}

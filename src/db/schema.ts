import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/** Localised label: { az, ru, en, ka }. Every user-facing registry name uses this shape. */
export type Localized = { az: string; ru: string; en: string; ka: string };

export const roleEnum = pgEnum("role", ["admin", "operator"]);
export const ownerEnum = pgEnum("owner", ["AZ", "GR"]);
export const obligationEnum = pgEnum("obligation", ["required", "optional", "conditional"]);
/** Whether recording an operation opens or closes a technical-work (ТОИР) record. */
export const maintenanceEffectEnum = pgEnum("maintenance_effect", ["send", "return"]);
export const auditActionEnum = pgEnum("audit_action", ["insert", "update", "delete"]);

export const stations = pgTable("stations", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: jsonb("name").$type<Localized>().notNull(),
  country: text("country").notNull(), // AZ | GE
  sortOrder: integer("sort_order").notNull().default(0),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("operator"),
  /** Null for admins. Operators may only write operations belonging to this station. */
  stationId: integer("station_id").references(() => stations.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const locomotives = pgTable("locomotives", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  owner: ownerEnum("owner").notNull(),
  depot: text("depot"),
  currentStationId: integer("current_station_id").references(() => stations.id),
  isActive: boolean("is_active").notNull().default(true),
});

/**
 * Small controlled vocabularies in one table, discriminated by `kind`:
 *   maintenance_type    TO1 TO2 TO3 TR1 TR3   (ТОИР)
 *   maintenance_reason  why a locomotive went to ТОИР
 *   detach_reason       why wagons were detached
 *   turnaround_status   turnaround lifecycle
 * ponytail: single table for four flat lists. Promote a kind to its own table when it
 * grows real attributes (durations, cost, required-by rules).
 */
export const referenceValues = pgTable(
  "reference_values",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    code: text("code").notNull(),
    label: jsonb("label").$type<Localized>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [unique().on(t.kind, t.code), index("reference_values_kind_idx").on(t.kind)],
);

/** Extra inputs an operation collects beyond its timestamp. */
export type OperationField =
  | "train_number"
  | "locomotive"
  | "detach_reason"
  | "maintenance_reason"
  | "maintenance_type";

/**
 * The operation catalogue — seeded from docs/Operations.xlsx, editable at /admin/operations.
 * The 29-step turnaround is data, not code: reordering or adding a step is a row change.
 */
export const operationTypes = pgTable("operation_types", {
  id: serial("id").primaryKey(),
  seq: integer("seq").notNull().unique(),
  /**
   * The number docs/Operations.xlsx prints for this step ("16.1" for one inserted between 16
   * and 17). Shown wherever an operator reads an operation number; `seq` stays the ordering key
   * and the target of `conditionalOnSeq` / `parallelWithSeq`.
   */
  displayNo: text("display_no"),
  code: text("code").notNull().unique(),
  label: jsonb("label").$type<Localized>().notNull(),
  stationId: integer("station_id")
    .notNull()
    .references(() => stations.id),
  obligation: obligationEnum("obligation").notNull(),
  /** For `conditional`: this operation is required only once operation `conditionalOnSeq` is filled. */
  conditionalOnSeq: integer("conditional_on_seq"),
  /** Runs simultaneously with this operation — the pair is exempt from chronological ordering. */
  parallelWithSeq: integer("parallel_with_seq"),
  fields: jsonb("fields").$type<OperationField[]>().notNull().default([]),
  /**
   * Set on the two ТОИР step pairs so recording them maintains the technical work
   * registry instead of the operator having to enter it twice.
   */
  maintenanceEffect: maintenanceEffectEnum("maintenance_effect"),
  isActive: boolean("is_active").notNull().default(true),
});

/**
 * One train turnaround: Böyük Kəsik → Gardabani → Tbilisi → Gardabani → Böyük Kəsik.
 * A turnaround opens when the train arrives; the locomotive is null until an operation
 * that carries a `locomotive` field records the attachment.
 */
export const turnarounds = pgTable(
  "turnarounds",
  {
    id: serial("id").primaryKey(),
    /** Free text, as the operator types it. Parity (last digit) decides the direction. */
    trainNumber: text("train_number").notNull(),
    locomotiveId: integer("locomotive_id").references(() => locomotives.id),
    cycleDate: date("cycle_date").notNull(),
    statusCode: text("status_code").notNull().default("open"),
    openedBy: integer("opened_by")
      .notNull()
      .references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("turnarounds_cycle_date_idx").on(t.cycleDate),
    index("turnarounds_status_idx").on(t.statusCode),
    // Not unique on (train, date): the number follows the renumbering along the route, so two
    // turnarounds on one date can legitimately end up on the same number.
    index("turnarounds_train_date_idx").on(t.trainNumber, t.cycleDate),
  ],
);

export const turnaroundOperations = pgTable(
  "turnaround_operations",
  {
    id: serial("id").primaryKey(),
    turnaroundId: integer("turnaround_id")
      .notNull()
      .references(() => turnarounds.id, { onDelete: "cascade" }),
    operationTypeId: integer("operation_type_id")
      .notNull()
      .references(() => operationTypes.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    trainNumber: text("train_number"),
    locomotiveId: integer("locomotive_id").references(() => locomotives.id),
    detachReasonCode: text("detach_reason_code"),
    maintenanceReasonCode: text("maintenance_reason_code"),
    maintenanceTypeCode: text("maintenance_type_code"),
    note: text("note"),
    recordedBy: integer("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.turnaroundId, t.operationTypeId)],
);

/** Technical work registry (ТОИР). Rows are created by the send/return operations, and browsable on their own. */
export const maintenanceRecords = pgTable("maintenance_records", {
  id: serial("id").primaryKey(),
  locomotiveId: integer("locomotive_id")
    .notNull()
    .references(() => locomotives.id),
  turnaroundId: integer("turnaround_id").references(() => turnarounds.id, { onDelete: "set null" }),
  typeCode: text("type_code"),
  reasonCode: text("reason_code"),
  note: text("note"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
});

/**
 * Written by a Postgres trigger on every mutable table — see
 * src/db/migrations/9999_audit.sql. Application code cannot bypass it.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    tableName: text("table_name").notNull(),
    rowId: text("row_id").notNull(),
    action: auditActionEnum("action").notNull(),
    actorId: integer("actor_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_table_row_idx").on(t.tableName, t.rowId), index("audit_log_at_idx").on(t.at)],
);

export const stationsRelations = relations(stations, ({ many }) => ({
  users: many(users),
  operationTypes: many(operationTypes),
}));

export const usersRelations = relations(users, ({ one }) => ({
  station: one(stations, { fields: [users.stationId], references: [stations.id] }),
}));

export const locomotivesRelations = relations(locomotives, ({ one, many }) => ({
  currentStation: one(stations, { fields: [locomotives.currentStationId], references: [stations.id] }),
  turnarounds: many(turnarounds),
}));

export const operationTypesRelations = relations(operationTypes, ({ one }) => ({
  station: one(stations, { fields: [operationTypes.stationId], references: [stations.id] }),
}));

export const turnaroundsRelations = relations(turnarounds, ({ one, many }) => ({
  locomotive: one(locomotives, { fields: [turnarounds.locomotiveId], references: [locomotives.id] }),
  openedByUser: one(users, { fields: [turnarounds.openedBy], references: [users.id] }),
  operations: many(turnaroundOperations),
}));

export const turnaroundOperationsRelations = relations(turnaroundOperations, ({ one }) => ({
  turnaround: one(turnarounds, { fields: [turnaroundOperations.turnaroundId], references: [turnarounds.id] }),
  operationType: one(operationTypes, {
    fields: [turnaroundOperations.operationTypeId],
    references: [operationTypes.id],
  }),
  locomotive: one(locomotives, { fields: [turnaroundOperations.locomotiveId], references: [locomotives.id] }),
  recordedByUser: one(users, { fields: [turnaroundOperations.recordedBy], references: [users.id] }),
}));

export const maintenanceRecordsRelations = relations(maintenanceRecords, ({ one }) => ({
  locomotive: one(locomotives, { fields: [maintenanceRecords.locomotiveId], references: [locomotives.id] }),
  turnaround: one(turnarounds, { fields: [maintenanceRecords.turnaroundId], references: [turnarounds.id] }),
}));

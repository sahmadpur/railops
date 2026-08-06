CREATE TYPE "public"."audit_action" AS ENUM('insert', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."obligation" AS ENUM('required', 'optional', 'conditional');--> statement-breakpoint
CREATE TYPE "public"."owner" AS ENUM('AZ', 'GR');--> statement-breakpoint
CREATE TYPE "public"."parity" AS ENUM('even', 'odd');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'operator');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"row_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"actor_id" integer,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locomotives" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"owner" "owner" NOT NULL,
	"depot" text,
	"current_station_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "locomotives_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "maintenance_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"locomotive_id" integer NOT NULL,
	"turnaround_id" integer,
	"type_code" text,
	"reason_code" text,
	"note" text,
	"sent_at" timestamp with time zone NOT NULL,
	"returned_at" timestamp with time zone,
	"created_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"code" text NOT NULL,
	"label" jsonb NOT NULL,
	"station_id" integer NOT NULL,
	"obligation" "obligation" NOT NULL,
	"conditional_on_seq" integer,
	"parallel_with_seq" integer,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "operation_types_seq_unique" UNIQUE("seq"),
	CONSTRAINT "operation_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "reference_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"label" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reference_values_kind_code_unique" UNIQUE("kind","code")
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" jsonb NOT NULL,
	"country" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "train_numbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"parity" "parity" NOT NULL,
	"country" "owner" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "train_numbers_number_country_unique" UNIQUE("number","country")
);
--> statement-breakpoint
CREATE TABLE "turnaround_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"turnaround_id" integer NOT NULL,
	"operation_type_id" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"train_number_id" integer,
	"locomotive_id" integer,
	"detach_reason_code" text,
	"maintenance_reason_code" text,
	"maintenance_type_code" text,
	"note" text,
	"recorded_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turnaround_operations_turnaround_id_operation_type_id_unique" UNIQUE("turnaround_id","operation_type_id")
);
--> statement-breakpoint
CREATE TABLE "turnarounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"locomotive_id" integer NOT NULL,
	"cycle_date" date NOT NULL,
	"status_code" text DEFAULT 'open' NOT NULL,
	"opened_by" integer NOT NULL,
	"closed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'operator' NOT NULL,
	"station_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "locomotives" ADD CONSTRAINT "locomotives_current_station_id_stations_id_fk" FOREIGN KEY ("current_station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_locomotive_id_locomotives_id_fk" FOREIGN KEY ("locomotive_id") REFERENCES "public"."locomotives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_turnaround_id_turnarounds_id_fk" FOREIGN KEY ("turnaround_id") REFERENCES "public"."turnarounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_types" ADD CONSTRAINT "operation_types_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnaround_operations" ADD CONSTRAINT "turnaround_operations_turnaround_id_turnarounds_id_fk" FOREIGN KEY ("turnaround_id") REFERENCES "public"."turnarounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnaround_operations" ADD CONSTRAINT "turnaround_operations_operation_type_id_operation_types_id_fk" FOREIGN KEY ("operation_type_id") REFERENCES "public"."operation_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnaround_operations" ADD CONSTRAINT "turnaround_operations_train_number_id_train_numbers_id_fk" FOREIGN KEY ("train_number_id") REFERENCES "public"."train_numbers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnaround_operations" ADD CONSTRAINT "turnaround_operations_locomotive_id_locomotives_id_fk" FOREIGN KEY ("locomotive_id") REFERENCES "public"."locomotives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnaround_operations" ADD CONSTRAINT "turnaround_operations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnarounds" ADD CONSTRAINT "turnarounds_locomotive_id_locomotives_id_fk" FOREIGN KEY ("locomotive_id") REFERENCES "public"."locomotives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnarounds" ADD CONSTRAINT "turnarounds_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_table_row_idx" ON "audit_log" USING btree ("table_name","row_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "reference_values_kind_idx" ON "reference_values" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "turnarounds_cycle_date_idx" ON "turnarounds" USING btree ("cycle_date");--> statement-breakpoint
CREATE INDEX "turnarounds_status_idx" ON "turnarounds" USING btree ("status_code");--> statement-breakpoint
CREATE UNIQUE INDEX "turnarounds_loco_date_key" ON "turnarounds" USING btree ("locomotive_id","cycle_date");
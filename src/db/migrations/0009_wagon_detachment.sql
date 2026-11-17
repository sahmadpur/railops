ALTER TABLE "turnaround_operations" ADD COLUMN "wagon_count" integer;--> statement-breakpoint
ALTER TABLE "turnaround_operations" ADD COLUMN "detach_reason" text;--> statement-breakpoint
-- Reasons used to be picked from the detach_reason list; keep them readable as the Russian label.
UPDATE "turnaround_operations" o
SET "detach_reason" = COALESCE(
  (SELECT r."label"->>'ru' FROM "reference_values" r WHERE r."kind" = 'detach_reason' AND r."code" = o."detach_reason_code"),
  o."detach_reason_code"
)
WHERE o."detach_reason_code" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "turnaround_operations" DROP COLUMN "detach_reason_code";

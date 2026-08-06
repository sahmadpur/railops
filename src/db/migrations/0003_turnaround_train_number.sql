DROP INDEX "turnarounds_loco_date_key";--> statement-breakpoint
ALTER TABLE "turnarounds" ALTER COLUMN "locomotive_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "turnarounds" ADD COLUMN "train_number_id" integer;--> statement-breakpoint
ALTER TABLE "turnarounds" ADD CONSTRAINT "turnarounds_train_number_id_train_numbers_id_fk" FOREIGN KEY ("train_number_id") REFERENCES "public"."train_numbers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The column is added nullable and backfilled from the arrival step, which already recorded
-- the train number, before the NOT NULL is enforced. If SET NOT NULL fails, some turnaround
-- has no arrival recorded — give it a train number by hand rather than weakening the constraint.
UPDATE "turnarounds" tr
SET "train_number_id" = o."train_number_id"
FROM "turnaround_operations" o
JOIN "operation_types" ot ON ot."id" = o."operation_type_id"
WHERE o."turnaround_id" = tr."id" AND ot."seq" = 1 AND o."train_number_id" IS NOT NULL;--> statement-breakpoint
-- An empty turnaround has nothing to identify it by and nothing to lose: drop it. A turnaround
-- that does hold operations but still no train number is left alone, so SET NOT NULL fails loudly
-- rather than deleting recorded work.
DELETE FROM "turnarounds" tr
WHERE tr."train_number_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "turnaround_operations" o WHERE o."turnaround_id" = tr."id");--> statement-breakpoint
ALTER TABLE "turnarounds" ALTER COLUMN "train_number_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "turnarounds_train_date_key" ON "turnarounds" USING btree ("train_number_id","cycle_date");--> statement-breakpoint
-- Parity is now derived from the number itself; correct any row that disagrees.
UPDATE "train_numbers"
SET "parity" = CASE
    WHEN (right(regexp_replace("number", '\D', '', 'g'), 1))::int % 2 = 0 THEN 'even'::"public"."parity"
    ELSE 'odd'::"public"."parity"
  END
WHERE regexp_replace("number", '\D', '', 'g') <> '';

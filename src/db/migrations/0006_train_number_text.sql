-- The train number becomes free text on the turnaround and on each step, copied from the
-- registry row it used to point at. The registry itself (train_numbers) goes away.
ALTER TABLE "turnarounds" ADD COLUMN "train_number" text;--> statement-breakpoint
ALTER TABLE "turnaround_operations" ADD COLUMN "train_number" text;--> statement-breakpoint
UPDATE "turnarounds" tr SET "train_number" = tn."number"
FROM "train_numbers" tn WHERE tn."id" = tr."train_number_id";--> statement-breakpoint
UPDATE "turnaround_operations" o SET "train_number" = tn."number"
FROM "train_numbers" tn WHERE tn."id" = o."train_number_id";--> statement-breakpoint
ALTER TABLE "turnarounds" ALTER COLUMN "train_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "turnaround_operations" DROP CONSTRAINT "turnaround_operations_train_number_id_train_numbers_id_fk";--> statement-breakpoint
ALTER TABLE "turnarounds" DROP CONSTRAINT "turnarounds_train_number_id_train_numbers_id_fk";--> statement-breakpoint
DROP INDEX "turnarounds_train_date_idx";--> statement-breakpoint
CREATE INDEX "turnarounds_train_date_idx" ON "turnarounds" USING btree ("train_number","cycle_date");--> statement-breakpoint
ALTER TABLE "turnaround_operations" DROP COLUMN "train_number_id";--> statement-breakpoint
ALTER TABLE "turnarounds" DROP COLUMN "train_number_id";--> statement-breakpoint
DROP TABLE "train_numbers" CASCADE;--> statement-breakpoint
DROP TYPE "public"."parity";

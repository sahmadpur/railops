DROP INDEX "turnarounds_train_date_key";--> statement-breakpoint
CREATE INDEX "turnarounds_train_date_idx" ON "turnarounds" USING btree ("train_number_id","cycle_date");
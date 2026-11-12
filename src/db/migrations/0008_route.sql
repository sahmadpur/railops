ALTER TABLE "operation_types" DROP CONSTRAINT "operation_types_seq_unique";--> statement-breakpoint
ALTER TABLE "operation_types" ADD COLUMN "route" text DEFAULT 'BK' NOT NULL;--> statement-breakpoint
ALTER TABLE "turnarounds" ADD COLUMN "route" text DEFAULT 'BK' NOT NULL;--> statement-breakpoint
ALTER TABLE "operation_types" ADD CONSTRAINT "operation_types_route_seq_unique" UNIQUE("route","seq");
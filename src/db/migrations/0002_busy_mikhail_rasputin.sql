CREATE TYPE "public"."maintenance_effect" AS ENUM('send', 'return');--> statement-breakpoint
ALTER TABLE "operation_types" ADD COLUMN "maintenance_effect" "maintenance_effect";
-- One-time clean start for the one-way routes (2026-11-17): every train recorded so far, its
-- operations and the technical work registry are removed. Locomotives, users, stations, the
-- operation catalogue and reference lists stay. DELETE rather than TRUNCATE so the audit
-- triggers keep a before-image of every removed row.
DELETE FROM "maintenance_records";--> statement-breakpoint
DELETE FROM "turnaround_operations";--> statement-breakpoint
DELETE FROM "turnarounds";

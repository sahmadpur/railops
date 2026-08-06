# RailOps

Locomotive turnaround logging and registry for the Böyük Kəsik (AZ) → Gardabani (GE) → Tbilisi corridor.

Replaces the `Учёт оборота локомотивов` spreadsheet with a system that has access control, a
database-enforced audit trail, and validation of the operation sequence — while still printing and
exporting the same monthly journal the staff already read.

## Running

```bash
cp .env.example .env      # set AUTH_SECRET and ADMIN_PASSWORD
docker compose up --build
```

App on http://localhost:3000. The `migrate` service applies migrations and seeds reference data
before the app starts; it is idempotent, so every `up` is safe.

Production:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The prod overlay builds the standalone `runner` image, drops the source bind-mount, closes the
database port, and disables demo seed data.

## Concepts

**One record = one locomotive turnaround.** A turnaround carries the 28 ordered operations that run
from Böyük Kəsik out to Tbilisi and back. Train numbers (AZ, GR-even, GR-odd) attach to it as the
locomotive moves.

**The operation sequence is data, not code.** `operation_types` is seeded from `docs/Operations.xlsx`
and editable at `/admin/operations`. Each row declares its station, whether it is required, optional
or conditional, which operation it runs in parallel with, and which extra fields it collects. Adding
or reordering a step never requires a code change.

**Operators work their own station.** An operator's list shows only turnarounds whose next unfilled
mandatory step is at their station — a record appears once the previous station's part is done and
disappears once their own is. A fully filled but still-open turnaround stays with the route's final
station until it is closed. On the detail page they can only edit the operations belonging to
their assigned station; other stations' rows are read-only. Operators see just the turnaround
interface — dashboard, journal and admin pages are admin-only. Admins are unrestricted.

**Nothing is edited silently.** A Postgres trigger writes every insert, update and delete to
`audit_log` with the acting user, taken from the transaction-local `railops.actor_id` that
`withActor()` sets. Application code cannot bypass it.

**Times are corridor wall-clock.** `datetime-local` inputs carry no offset, so containers run with
`TZ=Asia/Baku` (Azerbaijan and Georgia are both UTC+4) and Postgres with the same zone.

## Layout

```
src/db/schema.ts              tables, enums, relations
src/db/migrations/            generated SQL + 0001_audit_triggers.sql
src/db/seed.mts               stations, the 28 operations, reference lists, admin user
src/db/actor.ts               withActor() — the only sanctioned write path
src/lib/turnaround-rules.ts   station scoping, chronology, close-completeness (pure, tested)
src/lib/journal.ts            the monthly grid, shared by the print page and the Excel export
src/actions/                  server actions (turnaround, registry, auth)
src/app/(app)/                authenticated pages; /admin requires the admin role
messages/{az,ru,en,ka}.json   UI strings, cookie-selected locale
```

## Checks

```bash
npm test        # turnaround rule tests
npm run lint
npx next build
```

## Commands

```bash
npm run db:generate   # after editing src/db/schema.ts
npm run db:migrate
npm run db:seed
```

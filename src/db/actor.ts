import { sql } from "drizzle-orm";

import { db } from "./index";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `fn` in a transaction tagged with the acting user, so the audit triggers
 * (src/db/migrations/0001_audit_triggers.sql) can record who made the change.
 * Every write path must go through this — a bare db.insert() lands in the audit
 * log with a null actor.
 */
export function withActor<T>(actorId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('railops.actor_id', ${String(actorId)}, true)`);
    return fn(tx);
  });
}

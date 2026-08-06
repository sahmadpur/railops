/**
 * Drizzle wraps driver failures in its own error whose message is only "Failed query: …" —
 * the SQLSTATE and the violated constraint live on the postgres.js error it carries as `cause`.
 * Matching on the message text therefore never sees them, so unwrap instead.
 */
export type PgError = { code?: string; constraint_name?: string };

export function pgError(error: unknown): PgError | null {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if ("code" in current || "constraint_name" in current) {
      const { code, constraint_name } = current as PgError;
      if (typeof code === "string" || typeof constraint_name === "string") return { code, constraint_name };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** SQLSTATE 23505 — unique_violation. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = pgError(error);
  if (pg?.code !== "23505") return false;
  return constraint === undefined || pg.constraint_name === constraint;
}

/** SQLSTATE 23503 — foreign_key_violation: the row is still referenced elsewhere. */
export function isForeignKeyViolation(error: unknown): boolean {
  return pgError(error)?.code === "23503";
}

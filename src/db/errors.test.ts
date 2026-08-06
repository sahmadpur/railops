import assert from "node:assert/strict";
import { test } from "node:test";

import { isForeignKeyViolation, isUniqueViolation, pgError } from "./errors";

/** The shape drizzle actually throws: its own error, with the postgres.js one as `cause`. */
function wrapped(cause: unknown) {
  return Object.assign(new Error('Failed query: insert into "turnarounds" ...'), { cause });
}

test("a unique violation is recognised through drizzle's wrapper", () => {
  const error = wrapped(
    Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      constraint_name: "turnarounds_train_date_key",
    }),
  );

  // The message alone carries neither the code nor the constraint — the whole point of unwrapping.
  assert.equal(String(error).includes("turnarounds_train_date_key"), false);
  assert.deepEqual(pgError(error), { code: "23505", constraint_name: "turnarounds_train_date_key" });
  assert.equal(isUniqueViolation(error), true);
  assert.equal(isUniqueViolation(error, "turnarounds_train_date_key"), true);
  assert.equal(isUniqueViolation(error, "turnarounds_loco_date_key"), false);
});

test("a row still referenced elsewhere reports a foreign key violation", () => {
  const referenced = wrapped(
    Object.assign(new Error("update or delete on table ... violates foreign key constraint"), {
      code: "23503",
      constraint_name: "turnarounds_locomotive_id_locomotives_id_fk",
    }),
  );
  assert.equal(isForeignKeyViolation(referenced), true);
  assert.equal(isForeignKeyViolation(new Error("boom")), false);
});

test("other failures are not mistaken for duplicates", () => {
  const notNull = wrapped(Object.assign(new Error("null value ..."), { code: "23502" }));
  assert.equal(isUniqueViolation(notNull), false);
  assert.equal(isForeignKeyViolation(notNull), false);
  assert.equal(isUniqueViolation(new Error("boom")), false);
  assert.equal(pgError(new Error("boom")), null);
  assert.equal(pgError(undefined), null);
});

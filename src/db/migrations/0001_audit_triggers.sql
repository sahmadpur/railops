-- Audit trail enforced in the database, not the application.
-- The actor is read from the transaction-local setting `railops.actor_id`, which
-- src/db/actor.ts sets at the start of every write transaction.

CREATE OR REPLACE FUNCTION railops_audit() RETURNS trigger AS $fn$
DECLARE
  v_actor integer;
BEGIN
  v_actor := nullif(current_setting('railops.actor_id', true), '')::integer;

  IF (TG_OP = 'DELETE') THEN
    INSERT INTO audit_log (table_name, row_id, action, actor_id, before, after)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'delete', v_actor, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Skip no-op updates so the trail stays readable.
    IF to_jsonb(OLD) = to_jsonb(NEW) THEN
      RETURN NEW;
    END IF;
    INSERT INTO audit_log (table_name, row_id, action, actor_id, before, after)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'update', v_actor, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO audit_log (table_name, row_id, action, actor_id, before, after)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'insert', v_actor, NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$fn$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Same, minus password hashes.
CREATE OR REPLACE FUNCTION railops_audit_users() RETURNS trigger AS $fn$
DECLARE
  v_actor integer;
BEGIN
  v_actor := nullif(current_setting('railops.actor_id', true), '')::integer;

  IF (TG_OP = 'DELETE') THEN
    INSERT INTO audit_log (table_name, row_id, action, actor_id, before, after)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'delete', v_actor, to_jsonb(OLD) - 'password_hash', NULL);
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF to_jsonb(OLD) = to_jsonb(NEW) THEN
      RETURN NEW;
    END IF;
    INSERT INTO audit_log (table_name, row_id, action, actor_id, before, after)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'update', v_actor,
            to_jsonb(OLD) - 'password_hash', to_jsonb(NEW) - 'password_hash');
    RETURN NEW;
  ELSE
    INSERT INTO audit_log (table_name, row_id, action, actor_id, before, after)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'insert', v_actor, NULL, to_jsonb(NEW) - 'password_hash');
    RETURN NEW;
  END IF;
END;
$fn$ LANGUAGE plpgsql;
--> statement-breakpoint

DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stations', 'locomotives', 'train_numbers', 'reference_values', 'operation_types',
    'turnarounds', 'turnaround_operations', 'maintenance_records'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'audit_' || t, t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION railops_audit()',
      'audit_' || t, t
    );
  END LOOP;
END $do$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_users ON users;
--> statement-breakpoint
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION railops_audit_users();

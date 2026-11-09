-- Compact transactional statement revisions, partitioned by ledger scope so
-- an update never locks revisions belonging to unrelated groups.
-- Up Migration
CREATE TABLE ledger_pair_revisions (
  scope_key text NOT NULL,
  low_user text NOT NULL,
  high_user text NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (low_user,high_user,scope_key)
);

CREATE FUNCTION bump_ledger_pair_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous jsonb; current_value jsonb; participant record;
BEGIN
  IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN current_value := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' AND previous IS NOT DISTINCT FROM current_value
  THEN RETURN NULL; END IF;
  FOR participant IN
    SELECT DISTINCT coalesce(value->>'group_id','') COLLATE "C" AS scope_key,
      least((value->>'from_user') COLLATE "C",(value->>'to_user') COLLATE "C") AS low_user,
      greatest((value->>'from_user') COLLATE "C",(value->>'to_user') COLLATE "C") AS high_user
    FROM (VALUES(previous),(current_value)) changes(value) WHERE value IS NOT NULL
    ORDER BY 1,2,3
  LOOP
    INSERT INTO ledger_pair_revisions(scope_key,low_user,high_user)
      VALUES(participant.scope_key,participant.low_user,participant.high_user)
      ON CONFLICT(low_user,high_user,scope_key) DO UPDATE SET revision=ledger_pair_revisions.revision+1;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER bump_expense_pair_revision AFTER INSERT OR UPDATE OR DELETE ON expense_pair_movements
  FOR EACH ROW EXECUTE FUNCTION bump_ledger_pair_revision();
CREATE TRIGGER bump_payment_pair_revision AFTER INSERT OR UPDATE OR DELETE ON settlements
  FOR EACH ROW EXECUTE FUNCTION bump_ledger_pair_revision();

-- Text and totals are part of what a statement displays even when they
-- leave the pair's debt unchanged. Trigger on the parent row as well, so
-- direct operator redaction and ordinary edits invalidate older pages.
CREATE FUNCTION bump_expense_metadata_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE participant record;
BEGIN
  IF (NEW.description,NEW.amount_cents,NEW.expense_date,NEW.currency,NEW.group_id,
      NEW.created_at,NEW.deleted_at,NEW.deleted_by,NEW.created_by,NEW.version)
    IS NOT DISTINCT FROM
     (OLD.description,OLD.amount_cents,OLD.expense_date,OLD.currency,OLD.group_id,
      OLD.created_at,OLD.deleted_at,OLD.deleted_by,OLD.created_by,OLD.version)
  THEN RETURN NULL; END IF;
  FOR participant IN
    SELECT coalesce(group_id,'') AS scope_key,
      least(from_user COLLATE "C",to_user COLLATE "C") AS low_user,
      greatest(from_user COLLATE "C",to_user COLLATE "C") AS high_user
    FROM expense_pair_movements WHERE expense_id=NEW.id
    ORDER BY 1,2,3
  LOOP
    INSERT INTO ledger_pair_revisions(scope_key,low_user,high_user)
      VALUES(participant.scope_key,participant.low_user,participant.high_user)
      ON CONFLICT(low_user,high_user,scope_key) DO UPDATE SET revision=ledger_pair_revisions.revision+1;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER bump_expense_metadata_revision AFTER UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION bump_expense_metadata_revision();

INSERT INTO ledger_pair_revisions(scope_key,low_user,high_user)
 SELECT DISTINCT coalesce(group_id,''),least(from_user COLLATE "C",to_user COLLATE "C"),greatest(from_user COLLATE "C",to_user COLLATE "C")
 FROM (SELECT group_id,from_user,to_user FROM expense_pair_movements
       UNION ALL SELECT group_id,from_user,to_user FROM settlements) movements;

-- Revisions carry only opaque ids, but the original account id is erased
-- from derived data too. Cleanup runs after all financial rows are remapped.
CREATE INDEX idx_ledger_pair_revisions_high ON ledger_pair_revisions(high_user);
CREATE FUNCTION erase_deleted_user_pair_revisions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM ledger_pair_revisions WHERE low_user=OLD.id OR high_user=OLD.id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER erase_deleted_user_pair_revisions AFTER DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION erase_deleted_user_pair_revisions();

-- A payment's UTC day increases with created_at, so timestamp/rank/id is
-- the same order without a non-indexable to_char() sort. Seek each direction
-- separately; each index scan stops at its requested page size.
CREATE INDEX idx_settlements_pair_statement ON settlements
  (from_user,to_user,created_at DESC,(CASE WHEN method = 'offset' THEN 1 ELSE 2 END) DESC,id COLLATE "C" DESC);

-- Down Migration
DROP INDEX idx_settlements_pair_statement;
DROP TRIGGER erase_deleted_user_pair_revisions ON users;
DROP FUNCTION erase_deleted_user_pair_revisions();
DROP TRIGGER bump_expense_metadata_revision ON expenses;
DROP FUNCTION bump_expense_metadata_revision();
DROP TRIGGER bump_payment_pair_revision ON settlements;
DROP TRIGGER bump_expense_pair_revision ON expense_pair_movements;
DROP FUNCTION bump_ledger_pair_revision();
DROP TABLE ledger_pair_revisions;

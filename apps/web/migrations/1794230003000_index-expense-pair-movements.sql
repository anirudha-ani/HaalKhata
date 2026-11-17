-- Persist exact per-expense pair contributions so reads aggregate or page
-- bounded rows. Cumulative-interval intersections are the greedy matching
-- of paid-minus-owed nets in shared/expense/debts.ts, in the same ICU order.
-- Every integer is retained, including a single odd cent and historical rows.
-- Up Migration

CREATE COLLATION IF NOT EXISTS ledger_user_order (provider = icu, locale = 'en-US', deterministic = true);

-- Erasure locks only the bill parents it can rewrite, before provider calls.
-- Every account-reference branch must be indexed so unrelated history is free.
CREATE INDEX idx_expenses_deleted_by ON expenses(deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX idx_expenses_updated_by ON expenses(updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX idx_expense_assignments_user ON expense_item_assignments(user_id, item_id);
CREATE INDEX idx_live_splits_host ON live_splits(host_id, expense_id);

CREATE TABLE expense_pair_movements (
  expense_id text NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  from_user text NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  to_user text NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  group_id text REFERENCES groups(id) ON DELETE CASCADE,
  currency text NOT NULL,
  expense_date text NOT NULL,
  created_at timestamptz NOT NULL,
  deleted_at timestamptz,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 10000000000000),
  PRIMARY KEY (expense_id, from_user, to_user),
  CHECK (from_user <> to_user)
);
CREATE INDEX idx_expense_movements_scope ON expense_pair_movements(group_id, currency, from_user, to_user) WHERE deleted_at IS NULL;
CREATE INDEX idx_expense_movements_pair ON expense_pair_movements(from_user, to_user, expense_date COLLATE "C" DESC, created_at DESC, expense_id COLLATE "C" DESC);
CREATE INDEX idx_expense_movements_reverse ON expense_pair_movements(to_user, from_user, expense_date COLLATE "C" DESC, created_at DESC, expense_id COLLATE "C" DESC);

CREATE FUNCTION refresh_expense_pair_movements(target_id text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- A child-row statement may already hold tuple locks, whereas ordinary
  -- expense edits update the parent first. Never wait in that inverted order:
  -- refuse contention explicitly so the entire caller transaction rolls back.
  -- NO KEY UPDATE remains compatible with child foreign-key KEY SHARE locks.
  PERFORM id FROM expenses WHERE id = target_id FOR NO KEY UPDATE NOWAIT;
  DELETE FROM expense_pair_movements WHERE expense_id = target_id;
  INSERT INTO expense_pair_movements(expense_id, from_user, to_user, group_id, currency, expense_date, created_at, deleted_at, amount_cents)
    WITH nets AS MATERIALIZED (
      SELECT user_id, sum(cents)::bigint AS cents FROM (
        SELECT user_id, amount_cents AS cents FROM expense_payers WHERE expense_id = target_id
        UNION ALL
        SELECT user_id, -owed_cents FROM expense_splits WHERE expense_id = target_id
      ) amount GROUP BY user_id HAVING sum(cents) <> 0
    ), creditors AS (
      SELECT user_id, cents, sum(cents) OVER (ORDER BY user_id COLLATE ledger_user_order) AS ending
        FROM nets WHERE cents > 0
    ), debtors AS (
      SELECT user_id, -cents AS cents, sum(-cents) OVER (ORDER BY user_id COLLATE ledger_user_order) AS ending
        FROM nets WHERE cents < 0
    )
    SELECT expense.id, debtors.user_id, creditors.user_id, expense.group_id, expense.currency,
           expense.expense_date, expense.created_at, expense.deleted_at,
           (least(debtors.ending, creditors.ending) - greatest(debtors.ending - debtors.cents, creditors.ending - creditors.cents))::bigint
      FROM expenses expense CROSS JOIN debtors CROSS JOIN creditors
     WHERE expense.id = target_id
       AND least(debtors.ending, creditors.ending) > greatest(debtors.ending - debtors.cents, creditors.ending - creditors.cents);
END;
$$;

-- Run after each complete SQL statement, so bulk insertion or replacement
-- computes each changed expense once. Immediate maintenance also preserves
-- read-your-writes inside live-split and account-erasure transactions.
CREATE FUNCTION refresh_changed_expense_movements() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR target_id IN SELECT expense_id FROM (SELECT DISTINCT expense_id FROM changed_new) affected ORDER BY expense_id COLLATE "C" LOOP
      PERFORM refresh_expense_pair_movements(target_id);
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOR target_id IN SELECT expense_id FROM (SELECT DISTINCT expense_id FROM changed_old) affected ORDER BY expense_id COLLATE "C" LOOP
      PERFORM refresh_expense_pair_movements(target_id);
    END LOOP;
  ELSE
    FOR target_id IN SELECT expense_id FROM (SELECT expense_id FROM changed_old UNION SELECT expense_id FROM changed_new) affected ORDER BY expense_id COLLATE "C" LOOP
      PERFORM refresh_expense_pair_movements(target_id);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER refresh_payer_movements_insert AFTER INSERT ON expense_payers REFERENCING NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION refresh_changed_expense_movements();
CREATE TRIGGER refresh_payer_movements_update AFTER UPDATE ON expense_payers REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION refresh_changed_expense_movements();
CREATE TRIGGER refresh_payer_movements_delete AFTER DELETE ON expense_payers REFERENCING OLD TABLE AS changed_old FOR EACH STATEMENT EXECUTE FUNCTION refresh_changed_expense_movements();
CREATE TRIGGER refresh_split_movements_insert AFTER INSERT ON expense_splits REFERENCING NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION refresh_changed_expense_movements();
CREATE TRIGGER refresh_split_movements_update AFTER UPDATE ON expense_splits REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION refresh_changed_expense_movements();
CREATE TRIGGER refresh_split_movements_delete AFTER DELETE ON expense_splits REFERENCING OLD TABLE AS changed_old FOR EACH STATEMENT EXECUTE FUNCTION refresh_changed_expense_movements();

CREATE FUNCTION update_expense_movement_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE expense_pair_movements SET group_id = NEW.group_id, currency = NEW.currency,
    expense_date = NEW.expense_date, created_at = NEW.created_at, deleted_at = NEW.deleted_at
    WHERE expense_id = NEW.id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER update_expense_movement_scope AFTER UPDATE OF group_id,currency,expense_date,created_at,deleted_at ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_expense_movement_scope();

-- Applied once before API readiness. Existing paid-back and deleted bills
-- receive the same contributions as newly written bills.
SELECT refresh_expense_pair_movements(id) FROM expenses ORDER BY id COLLATE "C";

-- Down Migration
DROP TRIGGER update_expense_movement_scope ON expenses;
DROP FUNCTION update_expense_movement_scope();
DROP TRIGGER refresh_payer_movements_insert ON expense_payers;
DROP TRIGGER refresh_payer_movements_update ON expense_payers;
DROP TRIGGER refresh_payer_movements_delete ON expense_payers;
DROP TRIGGER refresh_split_movements_insert ON expense_splits;
DROP TRIGGER refresh_split_movements_update ON expense_splits;
DROP TRIGGER refresh_split_movements_delete ON expense_splits;
DROP FUNCTION refresh_changed_expense_movements();
DROP FUNCTION refresh_expense_pair_movements(text);
DROP TABLE expense_pair_movements;
DROP COLLATION ledger_user_order;
DROP INDEX idx_live_splits_host;
DROP INDEX idx_expense_assignments_user;
DROP INDEX idx_expenses_updated_by;
DROP INDEX idx_expenses_deleted_by;

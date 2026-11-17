-- Up Migration

-- Paying back one expense from its own page. The payment is an ordinary
-- settlement: it pays down the balance the expense lives in, exactly as a
-- payment made from the group's page would, and every balance reads it the
-- same way. What it adds is which expense the person said it was for, so
-- that expense's page can say it has been paid back, and stop offering to
-- take the same money twice.
ALTER TABLE settlements ADD COLUMN expense_id TEXT REFERENCES expenses(id);
CREATE INDEX idx_settlements_expense
  ON settlements(expense_id) WHERE expense_id IS NOT NULL;

-- A payment for an expense is cash one person handed another for it. A net
-- settlement's rows (its cash and its cancelled balances) are about the
-- pair's whole position, never about one expense.
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_expense_not_net
  CHECK (expense_id IS NULL OR net_settlement_id IS NULL);

-- A payment for an expense lives where the expense's debt lives: the same
-- group (or none, for a one-off) and the same currency. Recorded anywhere
-- else it would pay down a balance the expense never added to, while its
-- page said it had been paid back. An expense never changes group or
-- currency, so checking when the payment is written is enough.
CREATE FUNCTION check_settlement_expense_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.expense_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM expenses
     WHERE id = NEW.expense_id
       AND group_id IS NOT DISTINCT FROM NEW.group_id
       AND currency = NEW.currency
  ) THEN
    RAISE EXCEPTION 'settlement % names expense % but is not in its group and currency',
      NEW.id, NEW.expense_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_settlement_expense_scope
  BEFORE INSERT OR UPDATE OF expense_id, group_id, currency ON settlements
  FOR EACH ROW EXECUTE FUNCTION check_settlement_expense_scope();

-- Down Migration

DROP TRIGGER IF EXISTS trg_settlement_expense_scope ON settlements;
DROP FUNCTION IF EXISTS check_settlement_expense_scope();
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_expense_not_net;
DROP INDEX IF EXISTS idx_settlements_expense;
ALTER TABLE settlements DROP COLUMN IF EXISTS expense_id;

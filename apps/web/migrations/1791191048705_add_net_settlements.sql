-- Up Migration

-- Settling two people on their net across scopes. Two people can owe each
-- other in different scopes of one currency at once (one way outside groups,
-- the other way inside two), and the balance every list shows for them is
-- the net. Settling that means recording the cash that moved AND cancelling
-- the rest against each other where it lives, or each scope would go on
-- showing a debt that is no longer owed.
--
-- A net settlement is therefore several settlement rows that only mean
-- something together: the cash, the rest of the payer's debt cancelled, and
-- the opposing balances cancelled the other way. Removing one of them alone
-- would hand somebody money that never existed, so they are bound to one
-- parent row and the database itself refuses to commit a set that is
-- unbalanced or only partly removed.

-- A cancelling row is a settlement in every way the ledger cares about, but
-- it is not a payment, so it carries its own method and its own feed type
-- rather than passing as cash.
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_method;
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_method
  CHECK (method IN ('venmo', 'zelle', 'cashapp', 'paypal', 'cash', 'bank', 'other', 'offset'));
ALTER TABLE activity DROP CONSTRAINT IF EXISTS chk_activity_type;
ALTER TABLE activity ADD CONSTRAINT chk_activity_type
  CHECK (type IN (
    'group_created', 'member_added', 'simplify_debts', 'ownership_transferred',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'settlement_offset', 'settlement_deleted', 'other'
  ));

-- The parent states what the set must add up to. It carries no user ids on
-- purpose: the rows already do, and an account merge repoints those; a
-- second copy here would be one more place for the two to disagree.
CREATE TABLE net_settlements (
  id TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  -- The cash that moved, payer to creditor.
  cash_cents INTEGER NOT NULL,
  -- What was cancelled in each direction; the two directions are equal.
  offset_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_net_settlements_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_net_settlements_cash CHECK (cash_cents > 0 AND cash_cents <= 2000000000),
  CONSTRAINT chk_net_settlements_offset CHECK (offset_cents > 0 AND offset_cents <= 2000000000)
);

ALTER TABLE settlements
  ADD COLUMN net_settlement_id TEXT REFERENCES net_settlements(id);
CREATE INDEX idx_settlements_net_settlement
  ON settlements(net_settlement_id) WHERE net_settlement_id IS NOT NULL;

-- An offset cannot exist on its own: it is always one side of a set.
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_offset_has_parent
  CHECK (method <> 'offset' OR net_settlement_id IS NOT NULL);

-- Checked once per changed row when the transaction commits, so the rows of
-- a set can be written, or removed, one statement at a time inside it.
CREATE FUNCTION check_net_settlement_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  candidate TEXT;
  header net_settlements%ROWTYPE;
  row_total INTEGER;
  live_total INTEGER;
  currency_total INTEGER;
  pair_total INTEGER;
  row_currency TEXT;
  cash_sum BIGINT;
  cash_payers INTEGER;
  offset_sides INTEGER;
  offset_low BIGINT;
  offset_high BIGINT;
BEGIN
  FOREACH candidate IN ARRAY ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.net_settlement_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.net_settlement_id END
  ] LOOP
    CONTINUE WHEN candidate IS NULL;

    SELECT count(*),
           count(*) FILTER (WHERE deleted_at IS NULL),
           count(DISTINCT currency),
           count(DISTINCT LEAST(from_user, to_user) || '|' || GREATEST(from_user, to_user)),
           min(currency),
           COALESCE(sum(amount_cents) FILTER (WHERE method <> 'offset'), 0),
           count(DISTINCT from_user) FILTER (WHERE method <> 'offset')
      INTO row_total, live_total, currency_total, pair_total, row_currency, cash_sum, cash_payers
      FROM settlements
     WHERE net_settlement_id = candidate;

    -- Every row gone at once is the one clean exit: an account merge removes
    -- all payments between the two accounts it joins.
    CONTINUE WHEN row_total = 0;

    IF live_total <> 0 AND live_total <> row_total THEN
      RAISE EXCEPTION 'net settlement % is only partly removed (% of % rows live)',
        candidate, live_total, row_total USING ERRCODE = 'check_violation';
    END IF;
    IF currency_total <> 1 OR pair_total <> 1 THEN
      RAISE EXCEPTION 'net settlement % spans % currencies and % pairs of people; it must be one of each',
        candidate, currency_total, pair_total USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO header FROM net_settlements WHERE id = candidate;
    IF header.currency <> row_currency THEN
      RAISE EXCEPTION 'net settlement % is recorded in % but its rows are in %',
        candidate, header.currency, row_currency USING ERRCODE = 'check_violation';
    END IF;
    IF cash_payers <> 1 OR cash_sum <> header.cash_cents THEN
      RAISE EXCEPTION 'net settlement % holds % cents of cash from % payers; expected % from one',
        candidate, cash_sum, cash_payers, header.cash_cents USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*), min(side_cents), max(side_cents)
      INTO offset_sides, offset_low, offset_high
      FROM (
        SELECT sum(amount_cents) AS side_cents
          FROM settlements
         WHERE net_settlement_id = candidate AND method = 'offset'
         GROUP BY from_user
      ) AS sides;
    IF offset_sides <> 2 OR offset_low <> offset_high OR offset_low <> header.offset_cents THEN
      RAISE EXCEPTION 'net settlement % does not cancel out: % sides of % and % cents against % expected each way',
        candidate, offset_sides, offset_low, offset_high, header.offset_cents
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_net_settlement_integrity
  AFTER INSERT OR UPDATE OR DELETE ON settlements
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_net_settlement_integrity();

-- Down Migration

DROP TRIGGER IF EXISTS trg_net_settlement_integrity ON settlements;
DROP FUNCTION IF EXISTS check_net_settlement_integrity();
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_offset_has_parent;
DROP INDEX IF EXISTS idx_settlements_net_settlement;
ALTER TABLE settlements DROP COLUMN IF EXISTS net_settlement_id;
DROP TABLE IF EXISTS net_settlements;

-- A cancelling row still settled the balance it was recorded against;
-- relabel it rather than drop it, so rolling back does not reopen debts.
UPDATE settlements SET method = 'other' WHERE method = 'offset';
UPDATE activity SET type = 'other' WHERE type = 'settlement_offset';
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_method;
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_method
  CHECK (method IN ('venmo', 'zelle', 'cashapp', 'paypal', 'cash', 'bank', 'other'));
ALTER TABLE activity DROP CONSTRAINT IF EXISTS chk_activity_type;
ALTER TABLE activity ADD CONSTRAINT chk_activity_type
  CHECK (type IN (
    'group_created', 'member_added', 'simplify_debts', 'ownership_transferred',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'settlement_deleted', 'other'
  ));

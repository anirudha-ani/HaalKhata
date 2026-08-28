-- Up Migration

-- A single sequence orders expense creation and settlement recording after
-- their scope lock is held. PostgreSQL now() is the transaction start time,
-- so timestamps cannot safely order transactions that waited on each other.
CREATE SEQUENCE ledger_event_order_sequence AS BIGINT;

ALTER TABLE expenses ADD COLUMN ledger_event_order BIGINT;
ALTER TABLE settlements ADD COLUMN ledger_event_order BIGINT;

-- Existing settlement attribution is unknowable: protect every historical
-- expense conservatively by placing it before all historical settlements.
UPDATE expenses SET ledger_event_order = 0;
UPDATE settlements
SET ledger_event_order = nextval('ledger_event_order_sequence');

ALTER TABLE expenses
  ALTER COLUMN ledger_event_order SET DEFAULT nextval('ledger_event_order_sequence'),
  ALTER COLUMN ledger_event_order SET NOT NULL;
ALTER TABLE settlements
  ALTER COLUMN ledger_event_order SET DEFAULT nextval('ledger_event_order_sequence'),
  ALTER COLUMN ledger_event_order SET NOT NULL;

CREATE INDEX idx_settlements_group_event_order
  ON settlements(group_id, ledger_event_order)
  WHERE group_id IS NOT NULL;
CREATE INDEX idx_settlements_one_off_event_order
  ON settlements(from_user, to_user, ledger_event_order)
  WHERE group_id IS NULL;

-- Down Migration

DROP INDEX IF EXISTS idx_settlements_one_off_event_order;
DROP INDEX IF EXISTS idx_settlements_group_event_order;
ALTER TABLE settlements DROP COLUMN IF EXISTS ledger_event_order;
ALTER TABLE expenses DROP COLUMN IF EXISTS ledger_event_order;
DROP SEQUENCE IF EXISTS ledger_event_order_sequence;

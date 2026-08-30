-- Up Migration

-- Who asserted a payment, and who removed a payment or an expense, live on
-- the row itself rather than only in the feed event written beside it. A
-- settlement is a claim one of the two people typed in; the ledger has to
-- say which one without a join to a table that exists to be read, not to
-- be authoritative.
--
-- Backfill: every existing settlement predates the column, so nobody knows
-- who typed it. The payer is the most common recorder and the honest
-- default for the display; new rows always carry the real recorder.
ALTER TABLE settlements ADD COLUMN recorded_by TEXT REFERENCES users(id);
UPDATE settlements SET recorded_by = from_user WHERE recorded_by IS NULL;
ALTER TABLE settlements ALTER COLUMN recorded_by SET NOT NULL;
ALTER TABLE settlements ADD COLUMN deleted_by TEXT REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN deleted_by TEXT REFERENCES users(id);

-- A removal names its remover, and only a removal does.
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_deleted_by
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL) OR deleted_by IS NULL);
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_deleted_by
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL) OR deleted_by IS NULL);

-- Down Migration

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_deleted_by;
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_deleted_by;
ALTER TABLE expenses DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE settlements DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE settlements DROP COLUMN IF EXISTS recorded_by;

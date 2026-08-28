-- Up Migration

-- Application money uses signed int32 protobuf fields and INTEGER columns.
-- Keep every stored value below both limits even if a future write path skips
-- usecase validation. Aggregate balance queries still use PostgreSQL bigint.
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_money_max
  CHECK (amount_cents <= 2000000000 AND tax_cents <= 2000000000 AND tip_cents <= 2000000000);
ALTER TABLE expense_payers ADD CONSTRAINT chk_payers_amount_max
  CHECK (amount_cents <= 2000000000);
ALTER TABLE expense_splits ADD CONSTRAINT chk_splits_owed_max
  CHECK (owed_cents <= 2000000000);
ALTER TABLE expense_items ADD CONSTRAINT chk_items_total_max
  CHECK (total_cents <= 2000000000);
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_amount_max
  CHECK (amount_cents <= 2000000000);
ALTER TABLE activity ADD CONSTRAINT chk_activity_amount_max
  CHECK (amount_cents <= 2000000000);

-- Down Migration

ALTER TABLE activity DROP CONSTRAINT IF EXISTS chk_activity_amount_max;
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_amount_max;
ALTER TABLE expense_items DROP CONSTRAINT IF EXISTS chk_items_total_max;
ALTER TABLE expense_splits DROP CONSTRAINT IF EXISTS chk_splits_owed_max;
ALTER TABLE expense_payers DROP CONSTRAINT IF EXISTS chk_payers_amount_max;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_money_max;

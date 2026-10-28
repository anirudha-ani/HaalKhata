-- Up Migration

-- Money moves from 32-bit to 64-bit integers, in the API and here. A 32-bit
-- column stops at 21,474,836.47 in a two-decimal currency, which a rupiah
-- or dong flat deposit already passes. Each stored amount is now capped at
-- 100,000,000,000.00 (10^13 minor units): far beyond any real expense, and
-- low enough that a person's whole history in one currency, summed in
-- JavaScript, stays exact (the apps refuse an expense that would take
-- anyone past 10^15; see MAX_PERSON_VOLUME_CENTS).
ALTER TABLE expenses DROP CONSTRAINT chk_expenses_money_max;
ALTER TABLE expense_payers DROP CONSTRAINT chk_payers_amount_max;
ALTER TABLE expense_splits DROP CONSTRAINT chk_splits_owed_max;
ALTER TABLE expense_items DROP CONSTRAINT chk_items_total_max;
ALTER TABLE settlements DROP CONSTRAINT chk_settlements_amount_max;
ALTER TABLE activity DROP CONSTRAINT chk_activity_amount_max;
ALTER TABLE net_settlements DROP CONSTRAINT chk_net_settlements_cash;
ALTER TABLE net_settlements DROP CONSTRAINT chk_net_settlements_offset;

ALTER TABLE expenses
  ALTER COLUMN amount_cents TYPE BIGINT,
  ALTER COLUMN tax_cents TYPE BIGINT,
  ALTER COLUMN tip_cents TYPE BIGINT;
ALTER TABLE expense_payers ALTER COLUMN amount_cents TYPE BIGINT;
ALTER TABLE expense_splits ALTER COLUMN owed_cents TYPE BIGINT;
ALTER TABLE expense_items ALTER COLUMN total_cents TYPE BIGINT;
ALTER TABLE settlements ALTER COLUMN amount_cents TYPE BIGINT;
ALTER TABLE activity ALTER COLUMN amount_cents TYPE BIGINT;
ALTER TABLE net_settlements
  ALTER COLUMN cash_cents TYPE BIGINT,
  ALTER COLUMN offset_cents TYPE BIGINT;

ALTER TABLE expenses ADD CONSTRAINT chk_expenses_money_max
  CHECK (amount_cents <= 10000000000000 AND tax_cents <= 10000000000000 AND tip_cents <= 10000000000000);
ALTER TABLE expense_payers ADD CONSTRAINT chk_payers_amount_max
  CHECK (amount_cents <= 10000000000000);
ALTER TABLE expense_splits ADD CONSTRAINT chk_splits_owed_max
  CHECK (owed_cents <= 10000000000000);
ALTER TABLE expense_items ADD CONSTRAINT chk_items_total_max
  CHECK (total_cents <= 10000000000000);
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_amount_max
  CHECK (amount_cents <= 10000000000000);
ALTER TABLE activity ADD CONSTRAINT chk_activity_amount_max
  CHECK (amount_cents <= 10000000000000);
ALTER TABLE net_settlements ADD CONSTRAINT chk_net_settlements_cash
  CHECK (cash_cents > 0 AND cash_cents <= 10000000000000);
ALTER TABLE net_settlements ADD CONSTRAINT chk_net_settlements_offset
  CHECK (offset_cents > 0 AND offset_cents <= 10000000000000);

-- Down Migration

-- Fails, as it should, if any amount no longer fits 32 bits.
ALTER TABLE net_settlements DROP CONSTRAINT chk_net_settlements_offset;
ALTER TABLE net_settlements DROP CONSTRAINT chk_net_settlements_cash;
ALTER TABLE activity DROP CONSTRAINT chk_activity_amount_max;
ALTER TABLE settlements DROP CONSTRAINT chk_settlements_amount_max;
ALTER TABLE expense_items DROP CONSTRAINT chk_items_total_max;
ALTER TABLE expense_splits DROP CONSTRAINT chk_splits_owed_max;
ALTER TABLE expense_payers DROP CONSTRAINT chk_payers_amount_max;
ALTER TABLE expenses DROP CONSTRAINT chk_expenses_money_max;

ALTER TABLE net_settlements
  ALTER COLUMN cash_cents TYPE INTEGER,
  ALTER COLUMN offset_cents TYPE INTEGER;
ALTER TABLE activity ALTER COLUMN amount_cents TYPE INTEGER;
ALTER TABLE settlements ALTER COLUMN amount_cents TYPE INTEGER;
ALTER TABLE expense_items ALTER COLUMN total_cents TYPE INTEGER;
ALTER TABLE expense_splits ALTER COLUMN owed_cents TYPE INTEGER;
ALTER TABLE expense_payers ALTER COLUMN amount_cents TYPE INTEGER;
ALTER TABLE expenses
  ALTER COLUMN amount_cents TYPE INTEGER,
  ALTER COLUMN tax_cents TYPE INTEGER,
  ALTER COLUMN tip_cents TYPE INTEGER;

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
ALTER TABLE net_settlements ADD CONSTRAINT chk_net_settlements_cash
  CHECK (cash_cents > 0 AND cash_cents <= 2000000000);
ALTER TABLE net_settlements ADD CONSTRAINT chk_net_settlements_offset
  CHECK (offset_cents > 0 AND offset_cents <= 2000000000);

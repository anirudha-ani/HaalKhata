-- Up Migration

-- Bound strings copied into activity/notification fan-out rows and every
-- free-form field accepted by the expense write path.
ALTER TABLE users ADD CONSTRAINT chk_users_name_length
  CHECK (char_length(name) BETWEEN 1 AND 120);
ALTER TABLE groups ADD CONSTRAINT chk_groups_name_length
  CHECK (char_length(name) BETWEEN 1 AND 120);
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_notes_length
  CHECK (char_length(notes) <= 2000);
ALTER TABLE expense_items ADD CONSTRAINT chk_items_name_length
  CHECK (char_length(name) BETWEEN 1 AND 200);
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_note_length
  CHECK (char_length(note) <= 1000);

-- Currency is stored in several tables and later passed to formatters. Empty
-- activity currency is intentional for non-money events; every other value is
-- one normalized three-letter uppercase code.
ALTER TABLE users ADD CONSTRAINT chk_users_currency_format
  CHECK (default_currency ~ '^[A-Z]{3}$');
ALTER TABLE groups ADD CONSTRAINT chk_groups_currency_format
  CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_currency_format
  CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_currency_format
  CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE activity ADD CONSTRAINT chk_activity_currency_format
  CHECK (currency = '' OR currency ~ '^[A-Z]{3}$');

-- Down Migration

ALTER TABLE activity DROP CONSTRAINT IF EXISTS chk_activity_currency_format;
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_currency_format;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_currency_format;
ALTER TABLE groups DROP CONSTRAINT IF EXISTS chk_groups_currency_format;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_currency_format;
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_note_length;
ALTER TABLE expense_items DROP CONSTRAINT IF EXISTS chk_items_name_length;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_notes_length;
ALTER TABLE groups DROP CONSTRAINT IF EXISTS chk_groups_name_length;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_name_length;

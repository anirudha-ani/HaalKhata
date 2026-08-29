-- Up Migration

-- Normalize legacy rows first. ADD CONSTRAINT validates every existing row,
-- and none of these bounds existed before this migration — createGroup and
-- updateProfile accepted any currency string, and no name or note had a
-- length limit — so one over-long value or one lowercase currency written
-- back then would abort the migration, and with it every request, because
-- the API waits on ensureMigrated() and retries the same failure forever.
-- Truncation matches what the application now refuses; a currency that is
-- not a code gets the same default a new account gets.
UPDATE users SET name = left(name, 120) WHERE char_length(name) > 120;
UPDATE users SET name = COALESCE(NULLIF(split_part(COALESCE(email, ''), '@', 1), ''), 'Someone')
  WHERE char_length(name) = 0;
UPDATE groups SET name = left(name, 120) WHERE char_length(name) > 120;
UPDATE groups SET name = 'Group' WHERE char_length(name) = 0;
UPDATE expenses SET notes = left(notes, 2000) WHERE char_length(notes) > 2000;
UPDATE expense_items SET name = left(name, 200) WHERE char_length(name) > 200;
UPDATE expense_items SET name = 'Item' WHERE char_length(name) = 0;
UPDATE settlements SET note = left(note, 1000) WHERE char_length(note) > 1000;

UPDATE users SET default_currency = upper(trim(default_currency))
  WHERE default_currency <> upper(trim(default_currency));
UPDATE users SET default_currency = 'USD' WHERE default_currency !~ '^[A-Z]{3}$';
UPDATE groups SET currency = upper(trim(currency)) WHERE currency <> upper(trim(currency));
UPDATE groups SET currency = 'USD' WHERE currency !~ '^[A-Z]{3}$';
UPDATE expenses SET currency = upper(trim(currency)) WHERE currency <> upper(trim(currency));
UPDATE expenses SET currency = 'USD' WHERE currency !~ '^[A-Z]{3}$';
UPDATE settlements SET currency = upper(trim(currency)) WHERE currency <> upper(trim(currency));
UPDATE settlements SET currency = 'USD' WHERE currency !~ '^[A-Z]{3}$';
UPDATE activity SET currency = upper(trim(currency)) WHERE currency <> upper(trim(currency));
UPDATE activity SET currency = '' WHERE currency <> '' AND currency !~ '^[A-Z]{3}$';

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

-- The normalization above is deliberately not reversed: truncated text and
-- corrected currency codes are what the application would have accepted, and
-- the originals were never valid input.
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

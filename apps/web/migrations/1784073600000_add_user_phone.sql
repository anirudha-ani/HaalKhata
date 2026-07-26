-- Up Migration

-- Adds an optional phone column to users. An account may have an email, a
-- phone, or both; either can be used to log in. Phone is stored in E.164
-- (e.g. "+14155552671") and is unique when present.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Unique index allowing multiple NULLs (existing rows have no phone) but
-- enforcing uniqueness for any account that sets one. Postgres treats NULLs
-- as distinct, so this is the right partial-unique behavior.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone) WHERE phone IS NOT NULL;

-- Email is no longer required: a phone-only account has NULL email. Existing
-- rows all have emails, so this is a safe drop of the NOT NULL constraint.
-- A CHECK ensures at least one of email/phone is set so an account always has
-- a login identifier.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT chk_users_has_identifier CHECK (email IS NOT NULL OR phone IS NOT NULL);

-- Down Migration

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_has_identifier;
-- Restore NOT NULL on email only when every row has one (safe on a clean DB).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email IS NULL) THEN
    ALTER TABLE users ALTER COLUMN email SET NOT NULL;
  END IF;
END $$;
DROP INDEX IF EXISTS idx_users_phone;
ALTER TABLE users DROP COLUMN IF EXISTS phone;

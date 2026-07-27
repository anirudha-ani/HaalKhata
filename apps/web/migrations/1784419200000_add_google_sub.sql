-- Up Migration

-- Google's `sub` claim is the stable per-account identifier. An email can be
-- changed or reassigned by its owner, so the address is what we LINK on (once,
-- and only when Google reports it verified) while `sub` is what we IDENTIFY by
-- on every subsequent sign-in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;

-- Partial unique index: one Google account maps to at most one row, while the
-- many rows without one (shadow users, legacy password accounts) are free to
-- share NULL. Mirrors the idx_users_phone treatment from add_user_phone.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users (google_sub) WHERE google_sub IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS idx_users_google_sub;
ALTER TABLE users DROP COLUMN IF EXISTS google_sub;

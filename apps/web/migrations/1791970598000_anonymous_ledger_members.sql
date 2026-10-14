-- Up Migration

-- Account deletion removes the original account. Fresh anonymous ledger-only
-- participants keep shared cents intact and cannot sign in or receive invites.
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE users DROP CONSTRAINT chk_users_has_identifier;
ALTER TABLE users ADD CONSTRAINT chk_users_has_identifier
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR merged_into IS NOT NULL OR deleted_at IS NOT NULL);
ALTER TABLE users ADD CONSTRAINT chk_anonymous_ledger_member
  CHECK (deleted_at IS NULL OR (email IS NULL AND phone IS NULL AND phone_verified_at IS NULL
    AND google_sub IS NULL AND apple_sub IS NULL AND password_hash IS NULL AND avatar_url IS NULL
    AND name = 'Deleted member'));

-- Down Migration

-- Erasure cannot be undone. Refuse rollback while retained ledger members exist.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Archive anonymous ledger references before rolling back account deletion support';
  END IF;
END $$;
ALTER TABLE users DROP CONSTRAINT chk_anonymous_ledger_member;
ALTER TABLE users DROP CONSTRAINT chk_users_has_identifier;
ALTER TABLE users ADD CONSTRAINT chk_users_has_identifier
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR merged_into IS NOT NULL);
ALTER TABLE users DROP COLUMN deleted_at;

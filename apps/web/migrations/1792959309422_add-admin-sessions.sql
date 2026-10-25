-- Up Migration

-- Sessions for the operator's admin page. Deliberately not the app's signed
-- session tokens: an admin session is an opaque random value, stored only as
-- its SHA-256, so it exists exactly as long as its row does. Signing out
-- deletes the row and the value is dead at once, rather than staying valid
-- until an embedded expiry passes; and a read of this table hands nobody a
-- usable session.
--
-- The email is the Google address that signed in. It is checked against the
-- operator allowlist again on every request, so removing an address from
-- the allowlist ends its sessions without touching this table.
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_admin_sessions_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_admin_sessions_email CHECK (char_length(email) BETWEEN 3 AND 320)
);

-- Expired rows are purged whenever a new session starts.
CREATE INDEX idx_admin_sessions_expires_at ON admin_sessions (expires_at);

-- Down Migration

DROP TABLE IF EXISTS admin_sessions;

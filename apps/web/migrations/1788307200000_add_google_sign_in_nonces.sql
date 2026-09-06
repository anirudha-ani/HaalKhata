-- Up Migration

-- Authentication nonces are hashed at rest and atomically deleted when a
-- matching Google ID token is accepted. Expired rows are purged whenever a
-- new challenge is issued; the index keeps that bounded cleanup inexpensive.
CREATE TABLE google_sign_in_nonces (
  nonce_hash TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_google_sign_in_nonce_hash
    CHECK (nonce_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX idx_google_sign_in_nonces_expires_at
  ON google_sign_in_nonces (expires_at);

-- Down Migration

DROP TABLE IF EXISTS google_sign_in_nonces;

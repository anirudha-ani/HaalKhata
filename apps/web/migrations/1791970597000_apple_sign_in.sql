-- Up Migration

ALTER TABLE users ADD COLUMN apple_sub TEXT UNIQUE;

CREATE TABLE apple_sign_in_challenges (
  state_hash TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  verifier_hash TEXT,
  mobile BOOLEAN NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX apple_sign_in_challenges_expiry ON apple_sign_in_challenges(expires_at);

CREATE TABLE apple_credentials (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  PRIMARY KEY (user_id, client_id)
);

-- Down Migration

DROP TABLE apple_credentials;
DROP TABLE apple_sign_in_challenges;
ALTER TABLE users DROP COLUMN apple_sub;

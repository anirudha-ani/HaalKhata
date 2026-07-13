-- Up Migration

-- B4/B21: token_version on users so password change / logout can invalidate
-- outstanding bearer tokens. Tokens embed the version at issue time; bumping
-- the column invalidates every previously issued token for that user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Down Migration

ALTER TABLE users DROP COLUMN IF EXISTS token_version;

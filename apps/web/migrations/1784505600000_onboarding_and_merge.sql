-- Up Migration

-- When the first-run flow was completed. NULL means the (app) layout still
-- redirects to /onboarding. Stamped even when every field is skipped —
-- deriving "done" from a nullable profile column instead would re-prompt
-- forever anyone who declined to fill it in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- Existing accounts predate onboarding and must not be sent through it.
UPDATE users SET onboarded_at = now() WHERE onboarded_at IS NULL;

-- Tombstone left behind when this row is absorbed into another during an
-- account merge. The merge repoints every reference it knows about, so the
-- row could simply be deleted; keeping it is insurance against a reference
-- neither the code nor its tests enumerated, and makes a bad merge
-- diagnosable after the fact rather than silently missing.
ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_into TEXT REFERENCES users(id);

-- Absorbed rows are never sign-in targets or search results; every identity
-- lookup filters on this being NULL, and the partial index keeps that cheap.
CREATE INDEX IF NOT EXISTS idx_users_merged_into
  ON users (merged_into) WHERE merged_into IS NOT NULL;

-- A merge hands the absorbed row's phone to the keeper, because claiming that
-- number is what authorized the merge in the first place. For a phone-only
-- invite that empties both identifier columns and trips
-- chk_users_has_identifier, so tombstones are exempted: `merged_into` is
-- itself an identifier, pointing at where the person actually lives now.
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_has_identifier;
ALTER TABLE users ADD CONSTRAINT chk_users_has_identifier
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR merged_into IS NOT NULL);

-- Down Migration

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_has_identifier;
-- Restoring the stricter form would fail against any tombstone, so drop them
-- back to a phone-less shadow state first; there is nothing to preserve in a
-- row whose every reference was already repointed.
DELETE FROM users WHERE merged_into IS NOT NULL AND email IS NULL AND phone IS NULL;
ALTER TABLE users ADD CONSTRAINT chk_users_has_identifier
  CHECK (email IS NOT NULL OR phone IS NOT NULL);
DROP INDEX IF EXISTS idx_users_merged_into;
ALTER TABLE users DROP COLUMN IF EXISTS merged_into;
ALTER TABLE users DROP COLUMN IF EXISTS onboarded_at;

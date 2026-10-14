-- Group archiving preserves settled history while removing it from active lists.
-- IF NOT EXISTS preserves flags from the earlier local-only migration name.

-- Up Migration

ALTER TABLE groups ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Down Migration

ALTER TABLE groups DROP COLUMN archived;

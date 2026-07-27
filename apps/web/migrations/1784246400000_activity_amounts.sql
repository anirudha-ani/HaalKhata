-- Up Migration

-- The feed stored only a pre-rendered sentence, so the UI had no amount to
-- lay out as a figure and no way to tell which direction money moved. These
-- are additive: the message stays authoritative for the wording.
ALTER TABLE activity ADD COLUMN IF NOT EXISTS amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT '';
-- For a settlement, who received the money. Lets the reader be told whether
-- an event moved money toward them without parsing the sentence. NULL for
-- every other event type; no FK, since the feed must survive a deleted user.
ALTER TABLE activity ADD COLUMN IF NOT EXISTS credit_user_id TEXT;

-- Keyset pagination reads (created_at, id) descending within an audience.
CREATE INDEX IF NOT EXISTS idx_activity_created_at_id ON activity (created_at DESC, id DESC);

-- Down Migration

DROP INDEX IF EXISTS idx_activity_created_at_id;
ALTER TABLE activity DROP COLUMN IF EXISTS credit_user_id;
ALTER TABLE activity DROP COLUMN IF EXISTS currency;
ALTER TABLE activity DROP COLUMN IF EXISTS amount_cents;

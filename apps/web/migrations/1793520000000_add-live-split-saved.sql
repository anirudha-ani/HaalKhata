-- Up Migration

-- When somebody in a live split last pressed Save. Everyone's avatar shows it:
-- joined, or saved.
ALTER TABLE live_split_people ADD COLUMN saved_at TIMESTAMPTZ;

-- Down Migration

ALTER TABLE live_split_people DROP COLUMN IF EXISTS saved_at;

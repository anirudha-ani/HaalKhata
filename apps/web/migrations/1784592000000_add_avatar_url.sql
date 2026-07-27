-- Up Migration

-- Profile picture URL, taken from the Google ID token's `picture` claim. It is
-- a hotlink to Google's CDN, not a stored image: this app persists no blobs at
-- all (receipt photos are processed and deliberately never written), and one
-- optional avatar is not worth becoming the first thing that does.
--
-- NULL for everyone else — invited rows, and Google accounts with no photo set.
-- The claim is documented as never guaranteed, so the initials avatar stays the
-- fallback rather than a legacy path.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Down Migration

ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;

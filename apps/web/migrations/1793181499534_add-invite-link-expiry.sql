-- Up Migration

-- A group's join link stops working a week after it is made, so a link that
-- escaped into a chat or a screenshot cannot let people in for ever. Asking
-- for the link after that mints a new one. Profile ("add me") links only
-- send a friend request the owner confirms, and keep no expiry.
ALTER TABLE invite_links ADD COLUMN expires_at TIMESTAMPTZ;

-- Links already shared keep working for a week from this release, then
-- stop like every new one. Links already turned off get the date they would
-- have had, so one turned off before it would have run out still reads as
-- turned off rather than expired.
UPDATE invite_links SET expires_at = now() + interval '7 days'
 WHERE kind = 'group' AND revoked_at IS NULL;
UPDATE invite_links SET expires_at = created_at + interval '7 days'
 WHERE kind = 'group' AND revoked_at IS NOT NULL;

ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_group_expiry
  CHECK (kind <> 'group' OR expires_at IS NOT NULL);

-- Down Migration

ALTER TABLE invite_links DROP CONSTRAINT IF EXISTS chk_invite_links_group_expiry;
ALTER TABLE invite_links DROP COLUMN IF EXISTS expires_at;

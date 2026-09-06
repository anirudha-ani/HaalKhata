-- Up Migration

-- Third invite-link kind: 'profile' — the owner's own shareable "add me"
-- link. No group, no invited row; the inviter IS the subject. Accepting it
-- sends an ordinary friend request (see plan.txt §33a), so the constraint
-- work here is only shape, not new safety machinery.
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_kind;
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_shape;
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_kind
  CHECK (kind IN ('friend', 'group', 'profile'));
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_shape CHECK (
  (kind = 'group' AND group_id IS NOT NULL AND invited_user_id IS NULL)
  OR (kind = 'friend' AND group_id IS NULL AND invited_user_id IS NOT NULL)
  OR (kind = 'profile' AND group_id IS NULL AND invited_user_id IS NULL)
);

-- One live profile link per person; regenerate = revoke + create.
CREATE UNIQUE INDEX uq_invite_links_active_profile
  ON invite_links (inviter_id) WHERE revoked_at IS NULL AND kind = 'profile';

-- Down Migration

DROP INDEX IF EXISTS uq_invite_links_active_profile;
DELETE FROM invite_links WHERE kind = 'profile';
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_shape;
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_kind;
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_kind
  CHECK (kind IN ('friend', 'group'));
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_shape CHECK (
  (kind = 'group' AND group_id IS NOT NULL AND invited_user_id IS NULL)
  OR (kind = 'friend' AND group_id IS NULL AND invited_user_id IS NOT NULL)
);

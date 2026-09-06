-- Up Migration

-- Shareable invite links. Two kinds:
--   'friend' — reminds a specific Invited (unregistered) person to sign up;
--              accepting claims that identity into the acceptor's account.
--   'group'  — one active join link per group; accepting enrols the caller.
--
-- The token is a bearer credential and is stored RAW on purpose: the share
-- button must show the same link every time, and a link is revocable the
-- moment it leaks. What makes a bearer link acceptable at all is the
-- no-transaction rule for unregistered accounts (plan.txt §33): claiming an
-- invite moves friendships and group memberships, never money.
CREATE TABLE invite_links (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  inviter_id TEXT NOT NULL REFERENCES users(id),
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  invited_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT chk_invite_links_token CHECK (token ~ '^[A-Za-z0-9_-]{43}$'),
  CONSTRAINT chk_invite_links_kind CHECK (kind IN ('friend', 'group')),
  CONSTRAINT chk_invite_links_shape CHECK (
    (kind = 'group' AND group_id IS NOT NULL AND invited_user_id IS NULL)
    OR (kind = 'friend' AND group_id IS NULL AND invited_user_id IS NOT NULL)
  )
);

-- One live link per group and per (inviter, invited) pair; regenerating is
-- revoke-then-create, and the partial indexes are the concurrency guard.
CREATE UNIQUE INDEX uq_invite_links_active_group
  ON invite_links (group_id) WHERE revoked_at IS NULL AND kind = 'group';
CREATE UNIQUE INDEX uq_invite_links_active_friend
  ON invite_links (inviter_id, invited_user_id)
  WHERE revoked_at IS NULL AND kind = 'friend';

-- Down Migration

DROP TABLE IF EXISTS invite_links;

-- Up Migration

-- A person exists in HaalKhata only once they have signed in. Until now an
-- email or phone typed into "Add friend" made a placeholder row, and a later
-- sign-up, an SMS-verified number or a one-person invite link could claim it:
-- its friendships, group seats and, on rows older than the 2026-09 rules, its
-- expense history moved to whoever claimed it. Nothing claims a row any more.
-- An invitation is a person's own profile link or a group's join link, and
-- whoever uses one signs up as themselves.
--
-- This retires every row that is not a signed-in person:
--   * placeholders: no password, Google or Apple credential, and not deleted;
--   * merge tombstones: rows already absorbed into another account.
-- A retired row that money or authorship still points at (a payer, split or
-- item share, a settlement, an expense or group it created, a comment, an
-- activity it acted in, an idempotency record) becomes an anonymous
-- "Deleted member", exactly what account deletion leaves behind, so nobody
-- else's balance moves. Every other retired row is deleted with its
-- friendships, requests, group seats, invite links and notifications. Then
-- users.merged_into and invite_links.invited_user_id go, and a CHECK makes a
-- live row that nobody can sign in to impossible.

CREATE TEMP TABLE retiring_users ON COMMIT DROP AS
SELECT usr.id,
       (EXISTS (SELECT 1 FROM expense_payers WHERE user_id = usr.id)
        OR EXISTS (SELECT 1 FROM expense_splits WHERE user_id = usr.id)
        OR EXISTS (SELECT 1 FROM expense_item_assignments WHERE user_id = usr.id)
        OR EXISTS (SELECT 1 FROM expenses WHERE created_by = usr.id OR deleted_by = usr.id)
        OR EXISTS (SELECT 1 FROM settlements
                    WHERE from_user = usr.id OR to_user = usr.id
                       OR recorded_by = usr.id OR deleted_by = usr.id)
        OR EXISTS (SELECT 1 FROM groups WHERE created_by = usr.id)
        OR EXISTS (SELECT 1 FROM comments WHERE user_id = usr.id)
        OR EXISTS (SELECT 1 FROM activity WHERE actor_id = usr.id)
        OR EXISTS (SELECT 1 FROM operations WHERE user_id = usr.id)) AS keeps_ledger
  FROM users usr
 WHERE usr.merged_into IS NOT NULL
    OR (usr.deleted_at IS NULL
        AND usr.password_hash IS NULL
        AND usr.google_sub IS NULL
        AND COALESCE(usr.apple_sub, '') = '');

-- One-person invite links exist only to claim a placeholder.
DELETE FROM invite_links
 WHERE kind = 'friend'
    OR inviter_id IN (SELECT id FROM retiring_users);

-- Everything social goes for every retired row, kept or not.
DELETE FROM friendships
 WHERE user_id IN (SELECT id FROM retiring_users)
    OR friend_id IN (SELECT id FROM retiring_users);
DELETE FROM friend_requests
 WHERE requester_id IN (SELECT id FROM retiring_users)
    OR recipient_id IN (SELECT id FROM retiring_users);
DELETE FROM notifications WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM phone_verifications WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM contact_lookup_usage WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM payment_methods WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM payment_method_removals WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM payment_handles WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM push_devices WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM push_preferences WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM push_kept_off WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM push_outbox WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM user_blocks
 WHERE blocker_id IN (SELECT id FROM retiring_users)
    OR blocked_id IN (SELECT id FROM retiring_users);
DELETE FROM content_reports
 WHERE reporter_id IN (SELECT id FROM retiring_users)
    OR reported_user_id IN (SELECT id FROM retiring_users);
DELETE FROM receipt_consents WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM receipt_scans WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM apple_credentials WHERE user_id IN (SELECT id FROM retiring_users);
DELETE FROM apple_sign_in_challenges WHERE user_id IN (SELECT id FROM retiring_users);

-- Rows the ledger still needs keep their id, cents and group seats and lose
-- everything that said who they were.
UPDATE users
   SET name = 'Deleted member', avatar_color = '#6b7280',
       email = NULL, phone = NULL, phone_verified_at = NULL, avatar_url = NULL,
       password_hash = NULL, google_sub = NULL, apple_sub = NULL,
       contact_discovery = NULL, deleted_at = COALESCE(deleted_at, now()),
       token_version = token_version + 1
 WHERE id IN (SELECT id FROM retiring_users WHERE keeps_ledger);

-- The rest leave no trace: no seat, and no id left in any feed's audience.
DELETE FROM group_members
 WHERE user_id IN (SELECT id FROM retiring_users WHERE NOT keeps_ledger);
UPDATE activity
   SET audience = audience - ARRAY(SELECT id FROM retiring_users WHERE NOT keeps_ledger)
 WHERE audience ?| ARRAY(SELECT id FROM retiring_users WHERE NOT keeps_ledger);
UPDATE activity SET credit_user_id = NULL
 WHERE credit_user_id IN (SELECT id FROM retiring_users WHERE NOT keeps_ledger);

-- merged_into is the only identifier a tombstone has, so the identifier
-- check is replaced before the column (and with it the self-reference) goes.
ALTER TABLE users DROP CONSTRAINT chk_users_has_identifier;
ALTER TABLE users DROP COLUMN merged_into;
DELETE FROM users WHERE id IN (SELECT id FROM retiring_users WHERE NOT keeps_ledger);
ALTER TABLE users ADD CONSTRAINT chk_users_has_identifier
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR deleted_at IS NOT NULL);
-- Mirrors isRegisteredUser(): a live row is somebody who can sign in.
ALTER TABLE users ADD CONSTRAINT chk_users_can_sign_in
  CHECK (deleted_at IS NOT NULL
         OR password_hash IS NOT NULL
         OR google_sub IS NOT NULL
         OR COALESCE(apple_sub, '') <> '');

DROP INDEX uq_invite_links_active_friend;
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_shape;
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_kind;
ALTER TABLE invite_links DROP COLUMN invited_user_id;
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_kind
  CHECK (kind IN ('group', 'profile'));
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_shape CHECK (
  (kind = 'group' AND group_id IS NOT NULL)
  OR (kind = 'profile' AND group_id IS NULL)
);

-- Down Migration

-- Restores the columns and constraints only. Retired rows are not restored:
-- deleted ones are gone and anonymized ones stay "Deleted member".
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_shape;
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_kind;
ALTER TABLE invite_links ADD COLUMN invited_user_id TEXT REFERENCES users(id);
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_kind
  CHECK (kind IN ('friend', 'group', 'profile'));
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_shape CHECK (
  (kind = 'group' AND group_id IS NOT NULL AND invited_user_id IS NULL)
  OR (kind = 'friend' AND group_id IS NULL AND invited_user_id IS NOT NULL)
  OR (kind = 'profile' AND group_id IS NULL AND invited_user_id IS NULL)
);
CREATE UNIQUE INDEX uq_invite_links_active_friend
  ON invite_links (inviter_id, invited_user_id) WHERE revoked_at IS NULL AND kind = 'friend';

ALTER TABLE users DROP CONSTRAINT chk_users_can_sign_in;
ALTER TABLE users ADD COLUMN merged_into TEXT REFERENCES users(id);
CREATE INDEX idx_users_merged_into ON users (merged_into) WHERE merged_into IS NOT NULL;
ALTER TABLE users DROP CONSTRAINT chk_users_has_identifier;
ALTER TABLE users ADD CONSTRAINT chk_users_has_identifier
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR merged_into IS NOT NULL OR deleted_at IS NOT NULL);

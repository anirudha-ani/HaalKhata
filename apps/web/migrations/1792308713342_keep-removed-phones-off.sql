-- Phones a person removed from their notifications, kept off until turned
-- on again from that phone.
-- Up Migration

-- "Remove" promises that phone gets no more notifications until they are
-- turned on there again. The phone itself would otherwise re-register on its
-- next launch, because the permission is still granted. A row here makes the
-- server refuse a background registration from that installation for that
-- account; a registration the person asked for on the phone (turn_on) clears
-- it. Signing out removes the phone without a row, so signing back in
-- reconnects it. Keyed by account, so another person signing in on the same
-- phone is unaffected.
CREATE TABLE push_kept_off (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL CHECK (installation_id ~ '^[A-Za-z0-9-]{1,64}$'),
  removed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, installation_id)
);

-- Down Migration

DROP TABLE IF EXISTS push_kept_off;

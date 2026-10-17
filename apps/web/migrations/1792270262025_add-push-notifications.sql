-- Push notifications: the phones that receive them, what each person wants,
-- and the outbox that turns a committed bell row into a push.
-- Up Migration

-- One row per app installation that may receive pushes. token_version is
-- users.token_version when the phone registered: signing out everywhere,
-- merge, deletion and suspension all bump the user's version, and a device
-- registered under an older one is never sent to again.
CREATE TABLE push_devices (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL UNIQUE
                  CHECK (installation_id ~ '^[A-Za-z0-9-]{1,64}$'),
  expo_token      TEXT NOT NULL UNIQUE
                  CHECK (expo_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'),
  platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  label           TEXT NOT NULL DEFAULT '' CHECK (length(label) <= 64),
  app_version     TEXT NOT NULL DEFAULT '' CHECK (length(app_version) <= 32),
  token_version   INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at    TIMESTAMPTZ
);
CREATE INDEX idx_push_devices_user ON push_devices (user_id, last_seen_at DESC);

-- Which categories a person wants pushed. No row means every category on.
CREATE TABLE push_preferences (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  expenses   BOOLEAN NOT NULL DEFAULT TRUE,
  comments   BOOLEAN NOT NULL DEFAULT TRUE,
  payments   BOOLEAN NOT NULL DEFAULT TRUE,
  groups     BOOLEAN NOT NULL DEFAULT TRUE,
  friends    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The outbox: one row per notification not yet handed to the delivery
-- service. Written on the same transaction as the notification, so a push
-- exists exactly when the change it announces committed; deleted once sent,
-- skipped or given up on.
CREATE TABLE push_outbox (
  notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT CHECK (length(last_error) <= 500)
);
CREATE INDEX idx_push_outbox_due ON push_outbox (next_attempt_at);

-- The delivery service's tickets, kept until their receipt is read (about
-- fifteen minutes later) or the service has forgotten them (a day).
CREATE TABLE push_tickets (
  ticket_id  TEXT PRIMARY KEY CHECK (length(ticket_id) BETWEEN 1 AND 128),
  device_id  TEXT NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_tickets_created ON push_tickets (created_at);

-- Every activity line now has a bell row for each other person who sees it:
-- members added or joining, and debt simplification, become their own kinds.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type
  CHECK (type IN (
    'added_to_group', 'member_added', 'ownership_transferred', 'simplify_debts',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'settlement_deleted', 'reminder', 'friend_request',
    'invite_accepted', 'phone_transferred', 'other'
  ));

-- Down Migration

DROP TABLE IF EXISTS push_tickets;
DROP TABLE IF EXISTS push_outbox;
DROP TABLE IF EXISTS push_preferences;
DROP TABLE IF EXISTS push_devices;
UPDATE notifications SET type = 'other'
 WHERE type IN ('member_added', 'simplify_debts');
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type
  CHECK (type IN (
    'added_to_group', 'ownership_transferred',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'settlement_deleted', 'reminder', 'friend_request',
    'invite_accepted', 'phone_transferred', 'other'
  ));

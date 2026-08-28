-- Up Migration

-- Explicit friendships require recipient consent. Pending rows are directed:
-- requester_id asked recipient_id, and only recipient_id may consume the row.
CREATE TABLE friend_requests (
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (requester_id, recipient_id),
  CONSTRAINT chk_friend_requests_distinct_users CHECK (requester_id <> recipient_id)
);

CREATE INDEX idx_friend_requests_recipient_created
  ON friend_requests (recipient_id, created_at DESC);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type
  CHECK (type IN (
    'added_to_group', 'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'reminder', 'friend_request', 'other'
  ));

-- Down Migration

UPDATE notifications SET type = 'other' WHERE type = 'friend_request';
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type
  CHECK (type IN (
    'added_to_group', 'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'reminder', 'other'
  ));

DROP TABLE IF EXISTS friend_requests;

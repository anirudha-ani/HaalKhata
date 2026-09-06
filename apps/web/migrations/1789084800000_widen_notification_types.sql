-- Up Migration

-- §33/§34 introduced two notification types the allowlist never learned:
-- 'invite_accepted' (an Invited person claimed their seats) and
-- 'phone_transferred' (a verified number moved accounts — the theft alarm).
-- Both inserts run inside their feature's transaction, so the missed
-- constraint rolled the whole accept/transfer back, not just the notice.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type
  CHECK (type IN (
    'added_to_group', 'ownership_transferred',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'settlement_deleted', 'reminder', 'friend_request',
    'invite_accepted', 'phone_transferred', 'other'
  ));

-- Down Migration

UPDATE notifications SET type = 'other'
 WHERE type IN ('invite_accepted', 'phone_transferred');
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type
  CHECK (type IN (
    'added_to_group', 'ownership_transferred',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'settlement_deleted', 'reminder', 'friend_request', 'other'
  ));

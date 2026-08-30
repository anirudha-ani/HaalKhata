-- Up Migration

-- Ownership can now be handed to another member, and the feed and the new
-- owner's notifications announce it. A new type rather than a neighbouring
-- one: the clients choose glyphs and filters by these values.
ALTER TABLE activity DROP CONSTRAINT IF EXISTS chk_activity_type;
ALTER TABLE activity ADD CONSTRAINT chk_activity_type
  CHECK (type IN (
    'group_created', 'member_added', 'simplify_debts', 'ownership_transferred',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'other'
  ));
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type
  CHECK (type IN (
    'added_to_group', 'ownership_transferred',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'reminder', 'friend_request', 'other'
  ));

-- Down Migration

UPDATE activity SET type = 'other' WHERE type = 'ownership_transferred';
UPDATE notifications SET type = 'other' WHERE type = 'ownership_transferred';
ALTER TABLE activity DROP CONSTRAINT IF EXISTS chk_activity_type;
ALTER TABLE activity ADD CONSTRAINT chk_activity_type
  CHECK (type IN (
    'group_created', 'member_added', 'simplify_debts',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'other'
  ));
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type
  CHECK (type IN (
    'added_to_group', 'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'reminder', 'friend_request', 'other'
  ));

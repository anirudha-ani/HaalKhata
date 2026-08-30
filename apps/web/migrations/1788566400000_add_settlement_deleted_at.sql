-- Up Migration

-- A mistaken payment can now be removed. Like expenses it is a soft delete:
-- the row keeps its place in the friend ledger, struck through, while every
-- balance computation ignores it. The feed and the other party's
-- notifications announce the removal under its own type.
ALTER TABLE settlements ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE activity DROP CONSTRAINT IF EXISTS chk_activity_type;
ALTER TABLE activity ADD CONSTRAINT chk_activity_type
  CHECK (type IN (
    'group_created', 'member_added', 'simplify_debts', 'ownership_transferred',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'settlement_deleted', 'other'
  ));
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type
  CHECK (type IN (
    'added_to_group', 'ownership_transferred',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'settlement_deleted', 'reminder', 'friend_request', 'other'
  ));

-- Down Migration

-- Deleted payments are dropped outright on the way down: with the column
-- gone they would otherwise count toward balances again.
DELETE FROM settlements WHERE deleted_at IS NOT NULL;
ALTER TABLE settlements DROP COLUMN IF EXISTS deleted_at;
UPDATE activity SET type = 'other' WHERE type = 'settlement_deleted';
UPDATE notifications SET type = 'other' WHERE type = 'settlement_deleted';
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

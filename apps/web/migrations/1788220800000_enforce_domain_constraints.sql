-- Up Migration

-- Normalize historical values before making the domain invariants mandatory.
-- The group creator is the owner in this product; any unknown role is reduced
-- to member first so malformed data can never acquire authorization power.
UPDATE group_members
SET role = 'member'
WHERE role NOT IN ('owner', 'member');

UPDATE group_members AS membership
SET role = 'owner'
FROM groups
WHERE membership.group_id = groups.id
  AND membership.user_id = groups.created_by
  AND membership.role <> 'owner';

UPDATE groups SET type = 'other'
WHERE type NOT IN ('trip', 'home', 'couple', 'other');

UPDATE expenses SET category = 'other'
WHERE category NOT IN (
  'general', 'food', 'transport', 'lodging', 'utilities', 'shopping', 'entertainment', 'other'
);

-- Exact faithfully represents the already-materialized owed_cents rows when a
-- legacy split label is unknown; no balance data is recomputed here.
UPDATE expenses SET split_type = 'exact'
WHERE split_type NOT IN ('equal', 'exact', 'percent', 'shares', 'itemized');

UPDATE settlements SET method = 'other'
WHERE method NOT IN ('venmo', 'zelle', 'cashapp', 'paypal', 'cash', 'bank', 'other');

-- A payment to oneself contributes zero net balance and can only be malformed
-- legacy/direct-SQL data. Remove it before enforcing the invariant.
DELETE FROM settlements WHERE from_user = to_user;

-- Unknown handles cannot be displayed or paid by any current client. Dropping
-- them is safer than relabeling multiple provider-specific identifiers as one
-- method and colliding on the (user_id, method) primary key.
DELETE FROM payment_handles
WHERE method NOT IN ('venmo', 'zelle', 'cashapp', 'paypal', 'cash', 'bank', 'other');

UPDATE activity SET type = 'other'
WHERE type NOT IN (
  'group_created', 'member_added', 'simplify_debts',
  'expense_added', 'expense_updated', 'expense_deleted',
  'comment', 'settlement', 'other'
);

UPDATE notifications SET type = 'other'
WHERE type NOT IN (
  'added_to_group', 'expense_added', 'expense_updated', 'expense_deleted',
  'comment', 'settlement', 'reminder', 'other'
);

ALTER TABLE group_members ADD CONSTRAINT chk_group_members_role
  CHECK (role IN ('owner', 'member'));
ALTER TABLE groups ADD CONSTRAINT chk_groups_type
  CHECK (type IN ('trip', 'home', 'couple', 'other'));
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_category
  CHECK (category IN (
    'general', 'food', 'transport', 'lodging', 'utilities', 'shopping', 'entertainment', 'other'
  ));
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_split_type
  CHECK (split_type IN ('equal', 'exact', 'percent', 'shares', 'itemized'));
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_method
  CHECK (method IN ('venmo', 'zelle', 'cashapp', 'paypal', 'cash', 'bank', 'other'));
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_distinct_users
  CHECK (from_user <> to_user);
ALTER TABLE payment_handles ADD CONSTRAINT chk_payment_handles_method
  CHECK (method IN ('venmo', 'zelle', 'cashapp', 'paypal', 'cash', 'bank', 'other'));
ALTER TABLE activity ADD CONSTRAINT chk_activity_type
  CHECK (type IN (
    'group_created', 'member_added', 'simplify_debts',
    'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'other'
  ));
ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type
  CHECK (type IN (
    'added_to_group', 'expense_added', 'expense_updated', 'expense_deleted',
    'comment', 'settlement', 'reminder', 'other'
  ));

-- Down Migration

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type;
ALTER TABLE activity DROP CONSTRAINT IF EXISTS chk_activity_type;
ALTER TABLE payment_handles DROP CONSTRAINT IF EXISTS chk_payment_handles_method;
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_distinct_users;
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_method;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_split_type;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_category;
ALTER TABLE groups DROP CONSTRAINT IF EXISTS chk_groups_type;
ALTER TABLE group_members DROP CONSTRAINT IF EXISTS chk_group_members_role;

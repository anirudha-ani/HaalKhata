-- Up Migration

-- B15: missing indexes used by hot read paths.
-- expense_payers(user_id): listExpensesInvolvingUser does a correlated EXISTS on it.
CREATE INDEX IF NOT EXISTS idx_payers_user ON expense_payers(user_id);
-- settlements: balance ledger queries filter by from_user / to_user / group_id.
CREATE INDEX IF NOT EXISTS idx_settlements_from ON settlements(from_user);
CREATE INDEX IF NOT EXISTS idx_settlements_to ON settlements(to_user);
CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
-- group_members(user_id): listGroupsByUser joins on it.
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
-- activity(group_id): listActivityForGroup filters by group_id.
CREATE INDEX IF NOT EXISTS idx_activity_group ON activity(group_id);
-- activity(audience) GIN: listActivityForUser uses audience @> to_jsonb(...) containment.
CREATE INDEX IF NOT EXISTS idx_activity_audience ON activity USING GIN (audience);
-- comments(expense_id): listCommentsByExpense filters by expense_id.
CREATE INDEX IF NOT EXISTS idx_comments_expense ON comments(expense_id);

-- B16: CHECK constraints so a future bypass (or direct SQL) can't store
-- negative money/weights/quantities that would corrupt balances.
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount CHECK (amount_cents >= 0);
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_tax CHECK (tax_cents >= 0);
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_tip CHECK (tip_cents >= 0);
ALTER TABLE expense_payers ADD CONSTRAINT chk_payers_amount CHECK (amount_cents >= 0);
ALTER TABLE expense_splits ADD CONSTRAINT chk_splits_owed CHECK (owed_cents >= 0);
ALTER TABLE expense_items ADD CONSTRAINT chk_items_total CHECK (total_cents >= 0);
ALTER TABLE expense_items ADD CONSTRAINT chk_items_quantity CHECK (quantity > 0);
ALTER TABLE expense_item_assignments ADD CONSTRAINT chk_assignments_weight CHECK (weight > 0);
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_amount CHECK (amount_cents > 0);

-- B18: activity.group_id had no FK (presumably for a future group-delete
-- cascade). Add the FK with ON DELETE SET NULL so deleting a group leaves
-- the activity row intact (audience-scoped feed still works) but no
-- dangling group_id reference remains.
ALTER TABLE activity ADD CONSTRAINT fk_activity_group FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;

-- B19: friendships must not reference the same user on both sides.
ALTER TABLE friendships ADD CONSTRAINT chk_friendship_self CHECK (user_id <> friend_id);

-- Down Migration

DROP INDEX IF EXISTS idx_comments_expense;
DROP INDEX IF EXISTS idx_activity_audience;
DROP INDEX IF EXISTS idx_activity_group;
DROP INDEX IF EXISTS idx_group_members_user;
DROP INDEX IF EXISTS idx_settlements_group;
DROP INDEX IF EXISTS idx_settlements_to;
DROP INDEX IF EXISTS idx_settlements_from;
DROP INDEX IF EXISTS idx_payers_user;

ALTER TABLE friendships DROP CONSTRAINT IF EXISTS chk_friendship_self;
ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_group;
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_amount;
ALTER TABLE expense_item_assignments DROP CONSTRAINT IF EXISTS chk_assignments_weight;
ALTER TABLE expense_items DROP CONSTRAINT IF EXISTS chk_items_quantity;
ALTER TABLE expense_items DROP CONSTRAINT IF EXISTS chk_items_total;
ALTER TABLE expense_splits DROP CONSTRAINT IF EXISTS chk_splits_owed;
ALTER TABLE expense_payers DROP CONSTRAINT IF EXISTS chk_payers_amount;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_tip;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_tax;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_amount;

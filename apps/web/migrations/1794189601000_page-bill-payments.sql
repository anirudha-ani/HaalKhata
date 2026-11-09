-- Up Migration
-- Each party can page just their own payments in exact time order.
CREATE INDEX idx_bill_payments_from ON settlements (expense_id, from_user, created_at DESC, id DESC)
  WHERE expense_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_bill_payments_to ON settlements (expense_id, to_user, created_at DESC, id DESC)
  WHERE expense_id IS NOT NULL AND deleted_at IS NULL;

-- Down Migration
DROP INDEX idx_bill_payments_to;
DROP INDEX idx_bill_payments_from;

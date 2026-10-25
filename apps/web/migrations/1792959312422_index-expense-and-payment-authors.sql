-- Up Migration

-- The admin page lists the newest people with how many expenses each added
-- and how many payments each recorded. Neither column was indexed, so each
-- count read the whole table and grouped every author in it, for a list that
-- shows a few hundred. With these, the page picks its people first and
-- counts only their rows.
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses (created_by);
CREATE INDEX IF NOT EXISTS idx_settlements_recorded_by ON settlements (recorded_by);

-- Down Migration

DROP INDEX IF EXISTS idx_settlements_recorded_by;
DROP INDEX IF EXISTS idx_expenses_created_by;

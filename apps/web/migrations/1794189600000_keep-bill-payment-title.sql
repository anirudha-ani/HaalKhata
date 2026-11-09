-- Up Migration
-- Keep the title shared when money changed hands. Older payments have no
-- authorized title snapshot and retain the ordinary payment wording.
ALTER TABLE settlements ADD COLUMN expense_description TEXT;

-- Down Migration
ALTER TABLE settlements DROP COLUMN expense_description;

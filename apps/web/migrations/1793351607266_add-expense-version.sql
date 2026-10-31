-- Up Migration

-- Counts the saved changes to an expense and remembers who made the latest,
-- so an open edit form can ask "has this changed?" with one small read and
-- say whose change it was folding in.
ALTER TABLE expenses ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE expenses ADD COLUMN updated_by TEXT REFERENCES users(id);

-- A receipt's lines keep their order, so they do not move about on the
-- screens of people editing them together.
ALTER TABLE expense_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Down Migration

ALTER TABLE expense_items DROP COLUMN IF EXISTS position;
ALTER TABLE expenses DROP COLUMN IF EXISTS updated_by;
ALTER TABLE expenses DROP COLUMN IF EXISTS version;

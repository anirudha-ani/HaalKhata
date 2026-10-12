-- Up Migration

-- Two marks a payer's warning is worked out from, beside updated_at.
--
-- A payer is told when the details they are about to use came to be what
-- they are only recently, because details that suddenly differ are how a
-- payment gets redirected. updated_at covers an edit. It does not cover the
-- two other ways the place a payer is sent can change:
--
--   * the star moving to another method, which changes the one a payer is
--     shown first and has selected for them (preferred_at), and
--   * a method being removed and another added in its place, which reads as
--     a merely new method unless the removal is remembered
--     (payment_method_removals).
--
-- preferred_at is NULL for a method that is not starred, and for the stars
-- that exist today: when those were given is not known, and a guess would
-- warn payers about a change that may be years old.
ALTER TABLE payment_methods ADD COLUMN preferred_at TIMESTAMPTZ;
ALTER TABLE payment_methods ADD CONSTRAINT chk_payment_methods_preferred_at
  CHECK (is_preferred OR preferred_at IS NULL);

-- One row per person who has ever removed a method: when they last did.
-- Only the time is kept. The removed method itself is gone, as its owner
-- asked.
CREATE TABLE payment_method_removals (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  removed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE IF EXISTS payment_method_removals;
ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS chk_payment_methods_preferred_at;
ALTER TABLE payment_methods DROP COLUMN IF EXISTS preferred_at;

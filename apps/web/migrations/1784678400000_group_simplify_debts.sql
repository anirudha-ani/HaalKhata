-- Up Migration

-- Whether the group's debts are shown and settled as the min-cash-flow
-- simplification instead of the raw pairwise graph. A mode, not data: nets
-- are identical either way and balances stay fully derived, so flipping this
-- rewrites nothing — it only changes how a group routes its debt between
-- members, and which payments the settlement guards accept. It must be a
-- persisted group-level fact because the two routings can never both be live:
-- accepting payments along both graphs would let the same debt be paid twice.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS simplify_debts BOOLEAN NOT NULL DEFAULT FALSE;

-- Down Migration

ALTER TABLE groups DROP COLUMN IF EXISTS simplify_debts;

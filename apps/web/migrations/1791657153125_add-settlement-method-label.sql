-- Up Migration

-- The name of the payment method a payment was made with, copied from the
-- method at the moment the payment is recorded.
--
-- settlements.method stays one of a fixed set of keys, and a method a person
-- defined for themselves (bKash, a bank account) is recorded there as "bank"
-- or "other". The name is what makes that row say how the money moved, and
-- it is a copy on purpose: the method can be renamed or removed later, and
-- the record of a payment should not change with it.
--
-- Empty for every existing row, for cash, and for a cancelling ("offset")
-- row, which moved no money by any method.
ALTER TABLE settlements ADD COLUMN method_label TEXT NOT NULL DEFAULT '';
ALTER TABLE settlements ADD CONSTRAINT chk_settlements_method_label
  CHECK (char_length(method_label) <= 40);

-- Down Migration

ALTER TABLE settlements DROP CONSTRAINT IF EXISTS chk_settlements_method_label;
ALTER TABLE settlements DROP COLUMN IF EXISTS method_label;

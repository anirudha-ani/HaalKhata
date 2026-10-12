-- Up Migration

-- Payment methods a person defines for themselves. payment_handles could
-- hold one handle for each of four US apps; it had no place for bKash, a
-- bank account, the currency a method works in, or a preferred choice.
--
-- A method is a name, a currency and an ordered list of labelled details.
-- Nothing reads these tables yet: payment_handles stays the source of truth
-- until the clients switch, and a later migration copies its rows across.
CREATE TABLE payment_methods (
  -- TEXT, matching users.id: ids are generated app-side, not by Postgres.
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- What the owner calls it: "bKash", "Chase checking".
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  -- ISO 4217 code the method works in; NULL means any currency.
  currency     TEXT CHECK (currency ~ '^[A-Z]{3}$'),
  -- A built-in app whose prefix and link the clients know; NULL for a method
  -- the person defined.
  preset       TEXT CHECK (preset IN ('venmo', 'zelle', 'cashapp', 'paypal')),
  -- Optional instruction for the payer.
  note         TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When the name, currency, details or note last changed. Starring does not
  -- move it: a payer is shown a recent change to where the money goes.
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The one read path: a person's methods, oldest first.
CREATE INDEX idx_payment_methods_user ON payment_methods (user_id, created_at);

-- At most one starred method per person per currency. NULL is folded to ''
-- so "any currency" is a bucket of its own instead of escaping the index.
CREATE UNIQUE INDEX uq_payment_methods_preferred
  ON payment_methods (user_id, COALESCE(currency, '')) WHERE is_preferred;

-- A table rather than a JSON column so every kind, label and value is bounded
-- by a CHECK, like the rest of the schema.
CREATE TABLE payment_method_details (
  method_id TEXT NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
  -- Order the owner arranged the details in; at most eight per method.
  position  INTEGER NOT NULL CHECK (position BETWEEN 0 AND 7),
  -- Matches DETAIL_KINDS in @haalkhata/shared/payment/detailKinds.
  kind      TEXT NOT NULL CHECK (kind IN (
    'phone', 'email', 'username', 'account_name', 'bank_name', 'account_type',
    'account_number', 'routing_number', 'swift', 'iban', 'link', 'custom'
  )),
  -- Only a custom detail carries a label; every other kind takes its label
  -- from the catalog.
  label     TEXT NOT NULL DEFAULT '' CHECK (char_length(label) <= 30),
  -- 300 covers a payment link; the validator holds every other kind to 120.
  value     TEXT NOT NULL CHECK (char_length(value) BETWEEN 1 AND 300),
  PRIMARY KEY (method_id, position)
);

-- Down Migration

DROP TABLE IF EXISTS payment_method_details;
DROP TABLE IF EXISTS payment_methods;

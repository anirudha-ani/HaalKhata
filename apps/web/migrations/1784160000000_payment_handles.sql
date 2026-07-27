-- Up Migration

-- Where each person wants to be paid. Settling in this app only *records* a
-- payment — the money moves in Venmo, Zelle, Cash App or a bank app — so the
-- one thing the payer actually needs is the recipient's handle for whichever
-- of those they are about to open.
--
-- A table rather than columns on users: the set of P2P apps changes over time
-- and per country, and adding one should be a constant, not a migration.
CREATE TABLE IF NOT EXISTS payment_handles (
  -- TEXT, matching users.id — ids here are generated app-side, not by Postgres.
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Matches SETTLEMENT_METHODS, e.g. "venmo" | "zelle" | "cashapp" | "paypal".
  method  TEXT NOT NULL,
  -- The username, $cashtag, email or phone to send to, exactly as the owner
  -- typed it — these are opaque identifiers and must not be normalized.
  handle  TEXT NOT NULL,
  PRIMARY KEY (user_id, method)
);

-- Down Migration

DROP TABLE IF EXISTS payment_handles;

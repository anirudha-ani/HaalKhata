-- Up Migration

-- Idempotency keys for the financial mutations a client can retry. A retry
-- of a lost response used to store a second expense or a second payment
-- (the server minted a fresh id each time); now the client names the
-- operation and the server remembers what it produced.
--
-- One row per (user, rpc, client-generated id). The claim is inserted in
-- the same transaction as the business row: a concurrent duplicate blocks
-- on the primary key until the first commits, then finds the row and
-- replays its result; a crash rolls the claim back with everything else.
-- request_fingerprint pins the key to one payload, so reusing an id for a
-- different request is refused rather than silently answered with the old
-- result. Rows are pruned after 24 hours.
CREATE TABLE operations (
  user_id TEXT NOT NULL REFERENCES users(id),
  rpc TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  result_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rpc, operation_id)
);
CREATE INDEX idx_operations_created_at ON operations (created_at);

-- Down Migration

DROP TABLE IF EXISTS operations;

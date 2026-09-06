-- Up Migration

-- One active SMS verification per account. Binds the code check to the
-- account that requested the send (a code is only accepted by the account
-- whose row names that phone), makes approval single-use on OUR side (the
-- row is atomically deleted on success, so replay protection no longer
-- rests on the provider's semantics), and caps wrong-code attempts before
-- the provider is even called. The phone is stored raw: the row lives ten
-- minutes and the number lands on users anyway when verification succeeds.
CREATE TABLE phone_verifications (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  phone TEXT NOT NULL,
  check_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Durable ledger of verification-SMS sends, for the anti-pumping ceilings
-- (per destination number and per client address). These used to live in
-- process memory, where a restart reset them and a second replica would not
-- see them; a harassment ceiling that forgets on deploy is not a ceiling.
-- The destination is a keyed hash, never the raw number — the same rule the
-- in-memory limiter followed. Rows are pruned shortly after the longest
-- window they can still count toward (24 hours).
CREATE TABLE phone_send_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  destination_hash TEXT NOT NULL,
  client_ip TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_phone_send_events_destination ON phone_send_events (destination_hash, sent_at);
CREATE INDEX idx_phone_send_events_ip ON phone_send_events (client_ip, sent_at);

-- Down Migration

DROP TABLE IF EXISTS phone_send_events;
DROP TABLE IF EXISTS phone_verifications;

-- Contact discovery ("find friends from contacts"): whether people who hold
-- an account's verified number or email can find it, and a per-account count
-- of identifiers checked each day.
-- Up Migration

-- NULL means never asked and is treated as not findable. Every existing
-- account starts there: nobody verified a phone or signed in with an email
-- on the understanding that it would make them findable. TRUE and FALSE are
-- the person's own answer, set only through SetContactDiscovery.
ALTER TABLE users ADD COLUMN contact_discovery BOOLEAN;

-- The daily lookup quota. It holds a count and nothing else: the phone
-- numbers and emails a lookup carries are never written anywhere (App Review
-- 5.1.2(iv) forbids building a contact database from them). It lives in
-- Postgres rather than the in-process limiter because a restart must not
-- reset it; it is the limit that stops slow enumeration of the user base.
-- Older days are pruned by the next claim, so an account keeps one row.
CREATE TABLE contact_lookup_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_day DATE NOT NULL,
  identifiers_checked INTEGER NOT NULL,
  PRIMARY KEY (user_id, usage_day),
  CONSTRAINT chk_contact_lookup_usage_nonnegative CHECK (identifiers_checked >= 0)
);

-- Down Migration

DROP TABLE IF EXISTS contact_lookup_usage;
ALTER TABLE users DROP COLUMN IF EXISTS contact_discovery;

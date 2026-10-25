-- Up Migration

-- A receipt scan leaves nothing behind: the image lives in memory for one
-- request and the draft it produces is only saved if the person turns it
-- into an expense. That is the privacy design, and it also means nobody can
-- say how often scanning is used or how often it works. This table is the
-- answer to exactly that and nothing more: one row per attempt (a photo put
-- to a provider), who made it, when, and whether a provider read it. No
-- image, no merchant, no amounts, no line items, no provider response.
CREATE TABLE receipt_scans (
  id TEXT PRIMARY KEY,
  -- Deleting an account deletes its scans: a tally of who scanned when is
  -- about that person, and erasure leaves no trace of them.
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'parsed': a provider returned line items. 'failed': a provider read the
  -- photo and found none, or no provider answered. A request refused before
  -- any provider saw it (no permission, a bad file or currency, nothing
  -- configured) is not an attempt and has no row.
  outcome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_receipt_scans_outcome CHECK (outcome IN ('parsed', 'failed'))
);

-- A person's own count (their insights) reads by user; the usage overview
-- reads a trailing window by time.
CREATE INDEX idx_receipt_scans_user ON receipt_scans (user_id);
CREATE INDEX idx_receipt_scans_created_at ON receipt_scans (created_at);

-- Down Migration

DROP TABLE IF EXISTS receipt_scans;

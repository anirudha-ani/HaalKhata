-- Remember receipt-sharing permission per account; existing accounts start without consent.
-- Up Migration
CREATE TABLE receipt_consents (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  consent_version TEXT NOT NULL CHECK (length(consent_version) = 64),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE receipt_consents;

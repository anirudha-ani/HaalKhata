-- Up Migration

-- When this account's number last passed SMS possession (§32/§34); NULL means
-- never — which is every row that predates Twilio verification. Deliberately
-- backfilled as NULL rather than trusting phone IS NOT NULL: legacy numbers
-- were written by the old unverified SetPhone, and the whole point of storing
-- the fact is to stop inferring it.
ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMPTZ;

-- A stamp without a number is a contradiction; clearing the phone must clear
-- the stamp with it.
ALTER TABLE users ADD CONSTRAINT chk_users_phone_verified_has_phone
  CHECK (phone IS NOT NULL OR phone_verified_at IS NULL);

-- Down Migration

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_phone_verified_has_phone;
ALTER TABLE users DROP COLUMN IF EXISTS phone_verified_at;

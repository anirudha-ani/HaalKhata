-- Up Migration

-- Which Twilio Verify verification this account's row stands for. Twilio
-- answers a resend inside a verification's ten minutes with the same
-- verification (same code, same five checks, same expiry), and anything
-- else with a new one. The row learns which it got from the send's answer:
-- the same id keeps the attempt count and expiry, a new id starts them
-- afresh, with the expiry taken from when Twilio created it. Null until a
-- send has been accepted, which is the state a failed send leaves behind.
--
-- A check's follow-up writes (consumed on approval, forgotten when Twilio no
-- longer holds it, locked when Twilio's own limit is reached) match this id
-- as well as the number, so a check that resolves late cannot touch a newer
-- verification another session started in the meantime.
ALTER TABLE phone_verifications ADD COLUMN provider_sid TEXT;

-- Down Migration

ALTER TABLE phone_verifications DROP COLUMN IF EXISTS provider_sid;

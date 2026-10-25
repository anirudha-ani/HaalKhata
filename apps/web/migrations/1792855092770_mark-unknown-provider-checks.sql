-- Up Migration

-- Whether check_count holds every check the provider's verification has
-- taken. Twilio keeps one verification per number for its ten minutes, and
-- a send can reach one this row never followed: one started before the
-- account switched to another number and back, or one another account
-- started for the same number. Its earlier checks were spent elsewhere, so
-- the count here starts at zero without being the provider's, and a wrong
-- code is then refused without naming how many tries are left. Twilio's
-- own limit (60202) still locks the row when the provider reaches it.
--
-- True for every row that exists today, which is how they were read before
-- this column: as the provider's count.
ALTER TABLE phone_verifications ADD COLUMN checks_known BOOLEAN NOT NULL DEFAULT TRUE;

-- Down Migration

ALTER TABLE phone_verifications DROP COLUMN IF EXISTS checks_known;

-- Push delivery bookkeeping: which phones a queued push already reached, and
-- which token each accepted send went to.
-- Up Migration

-- A push row is retried as a whole when any of its recipient's phones fails.
-- The phones that already took it are listed here so a retry goes only to
-- the rest: a second send of the same push shows a duplicate banner on a
-- phone that already displayed the first. Bounded by the per-account phone
-- limit (10), with room to spare.
ALTER TABLE push_outbox
  ADD COLUMN delivered_device_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT chk_push_outbox_delivered_device_ids CHECK (cardinality(delivered_device_ids) <= 50);

-- The token a ticket was sent to. A late "DeviceNotRegistered" receipt says
-- that token is dead; the phone's row is removed only while it still holds
-- that token, so a reinstall that registered a new token is not undone by
-- the old token's receipt. NULL for tickets written before this column.
ALTER TABLE push_tickets
  ADD COLUMN expo_token TEXT
    CHECK (expo_token IS NULL OR expo_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$');

-- Down Migration

ALTER TABLE push_tickets DROP COLUMN IF EXISTS expo_token;
ALTER TABLE push_outbox DROP CONSTRAINT IF EXISTS chk_push_outbox_delivered_device_ids;
ALTER TABLE push_outbox DROP COLUMN IF EXISTS delivered_device_ids;

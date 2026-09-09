-- Up Migration

-- What the requester typed when they sent the request by email or phone, so
-- their "waiting for acceptance" list can echo it back without resolving the
-- account behind it: a pending request must not tell the sender whose account
-- an identifier is. NULL when the recipient was chosen by id or reached
-- through their profile link, where the requester already knew who they were
-- asking and the recipient's minimal profile is shown instead.
ALTER TABLE friend_requests ADD COLUMN recipient_identifier TEXT;

-- Down Migration

ALTER TABLE friend_requests DROP COLUMN IF EXISTS recipient_identifier;

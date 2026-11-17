-- Index explicit notification destinations used by erasure and moderation.
-- Up Migration

CREATE INDEX idx_notifications_link ON notifications (link);

-- Down Migration

DROP INDEX idx_notifications_link;

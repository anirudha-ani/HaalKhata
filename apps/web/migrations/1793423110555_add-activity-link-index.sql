-- Up Migration

-- Opening an expense reads its history from activity by link, and that was a
-- scan of the whole table, growing with every event anyone has ever had.
CREATE INDEX idx_activity_link ON activity (link);

-- Down Migration

DROP INDEX idx_activity_link;

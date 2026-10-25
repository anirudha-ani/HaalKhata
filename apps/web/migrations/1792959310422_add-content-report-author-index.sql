-- Up Migration

-- The admin page's list of suspended accounts finds each person's latest
-- report by reported_user_id, and deleting an account cascades through the
-- same column. Neither had an index to use: the queue's index covers only
-- open reports by date, and a suspended person's reports are often closed.
CREATE INDEX content_reports_author ON content_reports (reported_user_id, created_at DESC);

-- Down Migration

DROP INDEX IF EXISTS content_reports_author;

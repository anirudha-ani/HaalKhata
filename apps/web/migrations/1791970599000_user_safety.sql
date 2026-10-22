-- User safety without deleting shared financial records.
-- Up Migration
ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;
CREATE TABLE user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX user_blocks_target ON user_blocks(blocked_id, blocker_id);
CREATE TABLE content_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('comment', 'expense', 'group', 'user')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('harassment', 'hate', 'sexual', 'spam', 'other')),
  snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX content_report_once ON content_reports(reporter_id, target_kind, target_id) WHERE status = 'open';
CREATE INDEX content_reports_queue ON content_reports(created_at) WHERE status = 'open';
ALTER TABLE notifications ADD COLUMN actor_id TEXT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX notifications_actor ON notifications(actor_id, user_id);
-- Down Migration
ALTER TABLE users DROP COLUMN suspended_at;
ALTER TABLE notifications DROP COLUMN actor_id;
DROP TABLE content_reports;
DROP TABLE user_blocks;

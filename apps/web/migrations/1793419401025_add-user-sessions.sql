-- Up Migration

-- One row per sign-in: a browser or a phone. A session used to be nothing but
-- a signed token, so signing out could only end all of them at once, and
-- nobody could see where they were signed in. Ended rows stay until they
-- expire, so a token from before this table cannot be adopted back to life.
-- last_used_at moves when the session renews, at most once a day: it answers
-- "is this one of mine?" for the person it belongs to, and nothing reads it for
-- usage.
CREATE TABLE user_sessions (
  id            TEXT PRIMARY KEY CHECK (char_length(id) <= 80),
  user_id       TEXT NOT NULL REFERENCES users(id),
  device        TEXT NOT NULL CHECK (char_length(device) <= 80),
  is_app        BOOLEAN NOT NULL,
  token_version INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ
);

CREATE INDEX idx_user_sessions_user ON user_sessions (user_id, last_used_at DESC);

-- "Sign out everywhere else" must also reach tokens from before this table,
-- which name no session. Bumping token_version would, but it would refuse this
-- device's own requests still in flight and sign it out too.
ALTER TABLE users ADD COLUMN legacy_sessions_ended BOOLEAN NOT NULL DEFAULT false;

-- Which sign-in a phone registered under, so ending that session stops its
-- pushes and no other phone's. Empty for a phone not registered since this
-- table arrived.
ALTER TABLE push_devices ADD COLUMN session_id TEXT REFERENCES user_sessions(id) ON DELETE CASCADE;
CREATE INDEX idx_push_devices_session ON push_devices (session_id);

-- Down Migration

DROP INDEX idx_push_devices_session;
ALTER TABLE push_devices DROP COLUMN session_id;
ALTER TABLE users DROP COLUMN legacy_sessions_ended;
DROP TABLE user_sessions;

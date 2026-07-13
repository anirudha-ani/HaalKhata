-- Up Migration

-- IF NOT EXISTS everywhere: adopts databases created by the pre-migration
-- boot-time bootstrap without erroring; fresh databases create from scratch.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  default_currency TEXT NOT NULL DEFAULT 'USD',
  password_hash TEXT,            -- NULL = shadow user (invited, not registered)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

CREATE TABLE IF NOT EXISTS friendships (
  user_id TEXT NOT NULL REFERENCES users(id),
  friend_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',
  currency TEXT NOT NULL DEFAULT 'USD',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES groups(id),   -- NULL = one-off
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  expense_date TEXT NOT NULL,
  split_type TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  tax_cents INTEGER NOT NULL DEFAULT 0,
  tip_cents INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);

CREATE TABLE IF NOT EXISTS expense_payers (
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  PRIMARY KEY (expense_id, user_id)
);

CREATE TABLE IF NOT EXISTS expense_splits (
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  owed_cents INTEGER NOT NULL,
  PRIMARY KEY (expense_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_splits_user ON expense_splits(user_id);

CREATE TABLE IF NOT EXISTS expense_items (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_expense ON expense_items(expense_id);

CREATE TABLE IF NOT EXISTS expense_item_assignments (
  item_id TEXT NOT NULL REFERENCES expense_items(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  weight INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (item_id, user_id)
);

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES groups(id),   -- NULL = one-off
  from_user TEXT NOT NULL REFERENCES users(id),
  to_user TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  group_id TEXT,
  actor_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  audience JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array of user ids
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

-- Down Migration

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS activity;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS settlements;
DROP TABLE IF EXISTS expense_item_assignments;
DROP TABLE IF EXISTS expense_items;
DROP TABLE IF EXISTS expense_splits;
DROP TABLE IF EXISTS expense_payers;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS group_members;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS friendships;
DROP TABLE IF EXISTS users;

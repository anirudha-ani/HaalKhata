-- Up Migration

-- A live split: an itemized expense open to everyone at the table for a short
-- while, through a link, so each person can claim what they had. While one
-- runs, its lines may have nobody on them; they count against whoever paid
-- until somebody claims them, so the ledger is exact the whole time.
CREATE TABLE live_splits (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  host_id TEXT NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  -- The expense came into being with this split, so nobody has been told of
  -- it yet: the summary at the end announces it as new.
  new_expense BOOLEAN NOT NULL,
  -- Somebody changed it while it ran, so the end has something to announce.
  changed BOOLEAN NOT NULL DEFAULT FALSE
);

-- One at a time per expense, and the sweep's way to the ones past their end.
CREATE UNIQUE INDEX uq_live_splits_running ON live_splits (expense_id) WHERE finished_at IS NULL;
CREATE INDEX idx_live_splits_running_ends_at ON live_splits (ends_at) WHERE finished_at IS NULL;

-- Who has joined one that is running: what lets somebody with no share yet
-- see and edit the expense. Removed when it ends, so it leaves no record of
-- who sat where.
CREATE TABLE live_split_people (
  live_split_id TEXT NOT NULL REFERENCES live_splits(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (live_split_id, user_id)
);
CREATE INDEX idx_live_split_people_user ON live_split_people (user_id);

-- Its join link is an invite link like any other, ending when it does.
ALTER TABLE invite_links ADD COLUMN live_split_id TEXT REFERENCES live_splits(id);
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_shape;
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_kind;
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_kind
  CHECK (kind IN ('group', 'profile', 'live'));
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_shape CHECK (
  (kind = 'group' AND group_id IS NOT NULL AND live_split_id IS NULL)
  OR (kind = 'profile' AND group_id IS NULL AND live_split_id IS NULL)
  OR (kind = 'live' AND group_id IS NULL AND live_split_id IS NOT NULL AND expires_at IS NOT NULL)
);

-- Down Migration

DELETE FROM invite_links WHERE kind = 'live';
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_shape;
ALTER TABLE invite_links DROP CONSTRAINT chk_invite_links_kind;
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_kind
  CHECK (kind IN ('group', 'profile'));
ALTER TABLE invite_links ADD CONSTRAINT chk_invite_links_shape CHECK (
  (kind = 'group' AND group_id IS NOT NULL)
  OR (kind = 'profile' AND group_id IS NULL)
);
ALTER TABLE invite_links DROP COLUMN live_split_id;
DROP TABLE live_split_people;
DROP TABLE live_splits;

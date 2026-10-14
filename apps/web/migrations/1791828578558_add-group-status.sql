-- Replace the archive flag with an extensible group lifecycle enum.

-- Up Migration

CREATE TYPE group_status AS ENUM ('active', 'archived', 'deleted');
ALTER TABLE groups ADD COLUMN status group_status NOT NULL DEFAULT 'active';
UPDATE groups SET status = 'archived' WHERE archived;
ALTER TABLE groups DROP COLUMN archived;

-- Down Migration

-- A rollback must not restore visibility to a future soft-deleted group.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM groups WHERE status = 'deleted') THEN
    RAISE EXCEPTION 'Cannot remove group status while soft-deleted groups exist';
  END IF;
END $$;

ALTER TABLE groups ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE groups SET archived = (status = 'archived');
ALTER TABLE groups DROP COLUMN status;
DROP TYPE group_status;

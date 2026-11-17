-- Up Migration

-- Keep communication limits when presentation rows are cleared by a block.
CREATE TABLE reminder_cooldowns (
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_sent_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sender_id, recipient_id),
  CONSTRAINT chk_reminder_distinct_people CHECK (sender_id <> recipient_id)
);

-- The primary key covers sender deletion; index the other cascading foreign key.
CREATE INDEX idx_reminder_cooldowns_recipient ON reminder_cooldowns (recipient_id);

-- Legacy reminders stored their sender only in the internal friend-page link.
INSERT INTO reminder_cooldowns (sender_id, recipient_id, last_sent_at)
SELECT sender.id, notice.user_id, max(notice.created_at)
  FROM notifications notice
  JOIN users sender ON sender.id = COALESCE(notice.actor_id, substring(notice.link FROM 10))
 WHERE notice.type = 'reminder'
   AND notice.link = '/friends/' || sender.id
   AND sender.id <> notice.user_id
 GROUP BY sender.id, notice.user_id;

-- Down Migration

DROP TABLE reminder_cooldowns;

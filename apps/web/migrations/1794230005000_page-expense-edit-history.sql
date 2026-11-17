-- Keep edit-history page reads proportional to their limit, including tied times.
-- Up Migration
CREATE INDEX idx_activity_expense_history ON activity(link,created_at DESC,id COLLATE "C" DESC)
  WHERE type IN ('expense_added','expense_updated','expense_deleted');
CREATE INDEX idx_comments_expense_page ON comments(expense_id,created_at DESC,id DESC);
-- A loose index seek visits each historical author once; lateral page reads
-- skip arbitrarily long blocked runs without excluding former participants.
CREATE INDEX idx_comments_expense_author_page ON comments(expense_id,user_id,created_at DESC,id DESC);
-- Down Migration
DROP INDEX idx_comments_expense_author_page;
DROP INDEX idx_activity_expense_history;
DROP INDEX idx_comments_expense_page;

-- Operator-only moderation over the private database connection. Invoke through ops/moderate.sh.
\set ON_ERROR_STOP on
SELECT :'action' = 'list' AS listing, :'action' = 'remove' AS removing,
  :'action' = 'dismiss' AS dismissing, :'action' = 'suspend' AS suspending,
  :'action' = 'resume' AS resuming \gset
\if :listing
  SELECT id, created_at, target_kind, target_id, reported_user_id, reason, snapshot
  FROM content_reports WHERE status = 'open' ORDER BY created_at LIMIT 100;
\else
  BEGIN;
  SELECT target_id, target_kind, reported_user_id FROM content_reports
    WHERE id = :'report_id' FOR UPDATE \gset
  \if :{?target_id}
    \if :removing
      DELETE FROM comments WHERE id = :'target_id' AND :'target_kind' = 'comment';
      UPDATE expenses SET description = 'Content removed', notes = ''
        WHERE id = :'target_id' AND :'target_kind' = 'expense';
      UPDATE expense_items SET name = 'Item' WHERE expense_id = :'target_id' AND :'target_kind' = 'expense';
      UPDATE groups SET name = 'Shared group' WHERE id = :'target_id' AND :'target_kind' = 'group';
      UPDATE users SET name = 'Member', avatar_url = NULL WHERE id = :'target_id' AND :'target_kind' = 'user';
      DELETE FROM payment_handles WHERE user_id = :'target_id' AND :'target_kind' = 'user';
      -- Remove duplicated quotations without changing financial events or amounts.
      UPDATE activity SET message = 'Content removed after moderation'
        WHERE actor_id = :'reported_user_id' OR group_id = :'target_id' OR link = '/expenses/' || :'target_id';
      UPDATE notifications SET title = 'Content removed after moderation', body = ''
        WHERE actor_id = :'reported_user_id' OR link IN ('/expenses/' || :'target_id', '/groups/' || :'target_id');
      UPDATE content_reports SET status = 'removed', resolved_at = now() WHERE id = :'report_id';
    \endif
    \if :dismissing
      UPDATE content_reports SET status = 'dismissed', resolved_at = now() WHERE id = :'report_id';
    \endif
    \if :suspending
      UPDATE users SET suspended_at = now(), token_version = token_version + 1 WHERE id = :'reported_user_id';
    \endif
    \if :resuming
      UPDATE users SET suspended_at = NULL, token_version = token_version + 1 WHERE id = :'reported_user_id';
    \endif
    COMMIT;
  \else
    ROLLBACK;
    \echo 'Report not found; no changes made.'
    \quit 1
  \endif
\endif

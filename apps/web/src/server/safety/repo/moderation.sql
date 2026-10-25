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
      -- Replace the feed lines and notifications that quote the content, and no
      -- others, before the content changes: a comment's lines are found through
      -- the comment row. Financial events and amounts stay as they are.
      -- A comment: its author's comment lines on that expense. An expense: what
      -- links to it, comments included. A group: its feed but comments (every
      -- other line names the group), what links to it, and the notifications
      -- about its expenses (their body opens with the group's name). A profile:
      -- what they did (each line opens with their name), and every other line
      -- naming them: feed lines with them in the audience and their name in the
      -- text, and notifications with their name in the text that were sent to
      -- them or share a link with a feed line they are in the audience of.
      UPDATE activity SET message = 'Content removed after moderation'
        WHERE CASE :'target_kind'
          WHEN 'comment' THEN type = 'comment' AND (actor_id, link) =
            (SELECT user_id, '/expenses/' || expense_id FROM comments WHERE id = :'target_id')
          WHEN 'expense' THEN link = '/expenses/' || :'target_id'
          WHEN 'group' THEN group_id = :'target_id' AND type <> 'comment'
          WHEN 'user' THEN actor_id = :'target_id'
            OR (audience @> jsonb_build_array(:'target_id'::text)
                AND strpos(message, (SELECT name FROM users WHERE id = :'target_id')) > 0)
          ELSE false
        END;
      UPDATE notifications SET title = 'Content removed after moderation', body = ''
        WHERE CASE :'target_kind'
          WHEN 'comment' THEN type = 'comment' AND (actor_id, link) =
            (SELECT user_id, '/expenses/' || expense_id FROM comments WHERE id = :'target_id')
          WHEN 'expense' THEN link = '/expenses/' || :'target_id'
          WHEN 'group' THEN link = '/groups/' || :'target_id'
            OR (type IN ('expense_added', 'expense_updated', 'expense_deleted')
                AND link IN (SELECT '/expenses/' || id FROM expenses WHERE group_id = :'target_id'))
          WHEN 'user' THEN actor_id = :'target_id'
            OR ((strpos(title, (SELECT name FROM users WHERE id = :'target_id')) > 0
                 OR strpos(body, (SELECT name FROM users WHERE id = :'target_id')) > 0)
                AND (user_id = :'target_id'
                     OR link IN (SELECT link FROM activity
                                  WHERE audience @> jsonb_build_array(:'target_id'::text))))
          ELSE false
        END;
      DELETE FROM comments WHERE id = :'target_id' AND :'target_kind' = 'comment';
      UPDATE expenses SET description = 'Content removed', notes = ''
        WHERE id = :'target_id' AND :'target_kind' = 'expense';
      UPDATE expense_items SET name = 'Item' WHERE expense_id = :'target_id' AND :'target_kind' = 'expense';
      UPDATE groups SET name = 'Shared group' WHERE id = :'target_id' AND :'target_kind' = 'group';
      UPDATE users SET name = 'Member', avatar_url = NULL WHERE id = :'target_id' AND :'target_kind' = 'user';
      DELETE FROM payment_handles WHERE user_id = :'target_id' AND :'target_kind' = 'user';
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

-- Up Migration

-- Transactions are announced to their participants, not the whole group: if
-- you are A, "B paid C" is B and C's feed line. The write path now sets
-- audiences that way; this trims the rows written before it did. Structural
-- events (group_created, member_added, simplify_debts) stay group-wide —
-- they genuinely involve everyone.

-- Expense and comment events carry the expense id in their link, so the
-- participant set (payers + owers + whoever performed the action) is exact.
-- (expense_deleted links to the group or /friends and has no id to match on;
-- those rows keep their audience — amount-less inert history is not worth a
-- fuzzy match.)
UPDATE activity
SET audience = participants.aud
FROM (
  SELECT act.id AS activity_id,
         (
           SELECT jsonb_agg(DISTINCT person.uid)
           FROM (
             SELECT expense_payers.user_id AS uid
               FROM expense_payers WHERE expense_payers.expense_id = expenses.id
             UNION
             SELECT expense_splits.user_id
               FROM expense_splits WHERE expense_splits.expense_id = expenses.id
             UNION
             SELECT act.actor_id
           ) AS person(uid)
         ) AS aud
  FROM activity act
  JOIN expenses ON act.link = '/expenses/' || expenses.id
  WHERE act.type IN ('expense_added', 'expense_updated', 'comment')
) AS participants
WHERE activity.id = participants.activity_id;

-- Settlement events, exact half: on rows where the actor and the credited
-- user differ, they are the pair — either the row postdates payer
-- attribution (actor = payer), or its recorder was the payer anyway.
UPDATE activity
SET audience = jsonb_build_array(actor_id, credit_user_id)
WHERE type = 'settlement'
  AND credit_user_id IS NOT NULL
  AND actor_id <> credit_user_id;

-- Settlement events, fuzzy half: rows where the recorder was the creditor
-- (actor = credit_user_id, so the payer is not on the row) or nothing was
-- backfilled. Recover the pair from the settlements table by scope and
-- adjacency — insertActivity ran in the same request as insertSettlement —
-- exactly the match the amounts backfill used. Concurrent portions of one
-- payment share the same pair, so a near-miss inside the window is harmless.
UPDATE activity
SET audience = jsonb_build_array(matched.from_user, matched.to_user)
FROM (
  SELECT DISTINCT ON (act.id)
         act.id AS activity_id,
         settlements.from_user,
         settlements.to_user
  FROM activity act
  JOIN settlements
    ON settlements.group_id IS NOT DISTINCT FROM act.group_id
   AND settlements.created_at BETWEEN act.created_at - INTERVAL '5 seconds'
                                  AND act.created_at + INTERVAL '5 seconds'
  WHERE act.type = 'settlement'
    AND (act.credit_user_id IS NULL OR act.actor_id = act.credit_user_id)
  ORDER BY act.id, ABS(EXTRACT(EPOCH FROM (settlements.created_at - act.created_at)))
) AS matched
WHERE activity.id = matched.activity_id;

-- Down Migration

-- Irreversible by design: the wide audiences were the bug, and restoring
-- them would need the membership lists as they stood at each insert.
SELECT 1;

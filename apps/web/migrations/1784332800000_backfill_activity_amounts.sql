-- Up Migration

-- Rows written before the previous migration have amount_cents 0 and no
-- credit_user_id, so the feed cannot show their figure or tell which way a
-- settlement moved. Both are recoverable from the source tables.

-- Expense events carry the expense id in their link, so this join is exact.
-- (expense_deleted links to the group or /friends and has no id to match on;
-- those keep amount 0 and simply render without a figure.)
UPDATE activity
SET amount_cents = expenses.amount_cents,
    currency     = expenses.currency
FROM expenses
WHERE activity.link = '/expenses/' || expenses.id
  AND activity.amount_cents = 0;

-- Settlement events have no settlement id, but insertActivity runs in the
-- same request immediately after insertSettlement, so the pair is identifiable
-- by scope and adjacency. The window is deliberately tight, and DISTINCT ON
-- picks the nearest candidate so overlapping settlements cannot cross-match.
UPDATE activity
SET amount_cents   = matched.amount_cents,
    currency       = matched.currency,
    credit_user_id = matched.to_user
FROM (
  SELECT DISTINCT ON (act.id)
         act.id AS activity_id,
         settlements.amount_cents,
         settlements.currency,
         settlements.to_user
  FROM activity act
  JOIN settlements
    ON settlements.group_id IS NOT DISTINCT FROM act.group_id
   AND settlements.created_at BETWEEN act.created_at - INTERVAL '5 seconds'
                                  AND act.created_at + INTERVAL '5 seconds'
  WHERE act.type = 'settlement' AND act.credit_user_id IS NULL
  ORDER BY act.id, ABS(EXTRACT(EPOCH FROM (settlements.created_at - act.created_at)))
) AS matched
WHERE activity.id = matched.activity_id;

-- Down Migration

-- Irreversible by design: this only fills in values that were already
-- derivable, and clearing them again would lose nothing but help nobody.
SELECT 1;

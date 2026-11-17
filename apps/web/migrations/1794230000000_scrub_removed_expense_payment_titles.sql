-- Erase captured bill titles whose source was already moderated or anonymized.
-- Up Migration

-- Erasure locks its report references before account/content rows. The author
-- side already has an index; include closed reports on the reporter side too.
CREATE INDEX IF NOT EXISTS content_reports_reporter ON content_reports (reporter_id);

UPDATE settlements payment
   SET expense_description = 'Deleted expense'
  FROM expenses expense JOIN users author ON author.id = expense.created_by
 WHERE payment.expense_id = expense.id AND author.deleted_at IS NOT NULL
   AND payment.created_at <= author.deleted_at;

UPDATE settlements payment
   SET expense_description = 'Content removed'
 WHERE EXISTS (
   SELECT 1 FROM content_reports report
    WHERE report.target_id = payment.expense_id AND report.target_kind = 'expense'
      AND report.status = 'removed' AND payment.created_at <= report.resolved_at
 );

-- Down Migration

DROP INDEX IF EXISTS content_reports_reporter;
-- Removed private content cannot be restored.

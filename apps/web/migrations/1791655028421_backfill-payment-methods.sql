-- Up Migration

-- Copies every payment handle into the payment methods that replace them, so
-- nobody has to type theirs again. From here on payment_handles is neither
-- read nor written; it is left in place so this step can be undone without
-- losing anything, and a later migration drops it.
--
-- One statement, so a method never exists without its detail. The id is
-- derived from the handle's own key rather than generated: it makes the copy
-- safe to run twice, and lets the down migration remove exactly these rows.
WITH moves AS (
  SELECT md5('payment-handle:' || handle.user_id || ':' || handle.method)::uuid::text AS method_id,
         handle.user_id,
         handle.method,
         usr.created_at AS owner_since,
         -- Stored bare, the way the validator stores a built-in app's
         -- username: rows written before the sigil became furniture still
         -- carry an "@", a "$" or the whole paypal.me address.
         left(
           CASE handle.method
             WHEN 'venmo' THEN ltrim(btrim(handle.handle), '@')
             WHEN 'cashapp' THEN ltrim(btrim(handle.handle), '$')
             WHEN 'paypal' THEN rtrim(
               regexp_replace(
                 regexp_replace(btrim(handle.handle), '^https?://', '', 'i'),
                 '^(www\.)?paypal\.me/', '', 'i'
               ),
               '/'
             )
             ELSE btrim(handle.handle)
           END,
           120
         ) AS bare
    FROM payment_handles handle
    JOIN users usr ON usr.id = handle.user_id
), inserted AS (
  INSERT INTO payment_methods (id, user_id, name, currency, preset, created_at, updated_at)
  SELECT moves.method_id,
         moves.user_id,
         CASE moves.method
           WHEN 'venmo' THEN 'Venmo'
           WHEN 'zelle' THEN 'Zelle'
           WHEN 'cashapp' THEN 'Cash App'
           WHEN 'paypal' THEN 'PayPal'
           WHEN 'cash' THEN 'Cash'
           WHEN 'bank' THEN 'Bank transfer'
           ELSE 'Other'
         END,
         -- Venmo, Zelle and Cash App move US dollars; everything else is left
         -- as "any currency" (NULL) for its owner to narrow.
         CASE WHEN moves.method IN ('venmo', 'zelle', 'cashapp') THEN 'USD' END,
         CASE WHEN moves.method IN ('venmo', 'zelle', 'cashapp', 'paypal') THEN moves.method END,
         -- Dated from the account, not from today. created_at keeps them
         -- ahead of anything added later and in the order they were always
         -- listed; updated_at is what tells a payer that details changed
         -- recently, and a copy is not a change.
         moves.owner_since + (
           CASE moves.method
             WHEN 'venmo' THEN 0
             WHEN 'zelle' THEN 1
             WHEN 'cashapp' THEN 2
             WHEN 'paypal' THEN 3
             WHEN 'bank' THEN 4
             WHEN 'cash' THEN 5
             ELSE 6
           END
         ) * interval '1 millisecond',
         moves.owner_since
    FROM moves
   -- A handle that was only whitespace or only a sigil is not a handle.
   WHERE moves.bare <> ''
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
-- No method is starred: nobody chose one, so the copy does not choose for them.
INSERT INTO payment_method_details (method_id, position, kind, label, value)
SELECT moves.method_id,
       0,
       CASE
         WHEN moves.method IN ('venmo', 'cashapp', 'paypal') THEN 'username'
         -- Zelle is reached by whichever of the two its owner registered.
         WHEN moves.method = 'zelle' AND moves.bare LIKE '%@%' THEN 'email'
         WHEN moves.method = 'zelle' THEN 'phone'
         -- cash / bank / other never had a field on any screen; a handle on
         -- one of them came through the API and is kept as free text.
         ELSE 'custom'
       END,
       CASE WHEN moves.method IN ('venmo', 'zelle', 'cashapp', 'paypal') THEN '' ELSE 'Details' END,
       moves.bare
  FROM moves
  JOIN inserted ON inserted.id = moves.method_id;

-- Down Migration

-- Removes exactly the methods the copy created, found by the same derived
-- id; their details go with them. Methods people added since are untouched,
-- and payment_handles still holds everything that was copied.
DELETE FROM payment_methods method
 USING payment_handles handle
 WHERE method.id = md5('payment-handle:' || handle.user_id || ':' || handle.method)::uuid::text;

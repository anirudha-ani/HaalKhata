-- Up Migration

-- 1784505600000_onboarding_and_merge stamped onboarded_at = now() on every
-- row that existed when it ran, so nobody already using the app was sent
-- through the new first-run flow. That one instant is not when any of them
-- joined, yet onboarded_at is read as the join date: the admin page counted
-- every early account as new in the week the migration ran, and personal
-- insights dated their "member since" from it.
--
-- The stamped rows can be recognised: they share one exact instant (one
-- statement's now()), it is the earliest onboarded_at in the table, and each
-- row was made before it. A real onboarding is a transaction of its own, so
-- no two people finish it at the same microsecond. A database that was empty
-- when the stamp ran has no shared earliest instant, and nothing changes.
--
-- Someone who can sign in joined when their row was made. A placeholder for
-- someone invited who has still never signed in has not joined at all:
-- clearing the stamp gives them the first-run flow when they arrive, as every
-- invitation since does, and dates them from then. A placeholder that signed
-- in after the stamp cannot be told apart from an early account, and is
-- dated from when its row was made, the nearest instant the table keeps.
WITH stamp AS (
  SELECT onboarded_at AS stamped_at
    FROM users
   WHERE onboarded_at = (SELECT MIN(onboarded_at) FROM users)
   GROUP BY onboarded_at
  HAVING COUNT(*) > 1
)
UPDATE users usr
   SET onboarded_at = CASE
         WHEN usr.google_sub IS NOT NULL OR usr.apple_sub IS NOT NULL OR usr.password_hash IS NOT NULL
           THEN usr.created_at
       END
  FROM stamp
 WHERE usr.onboarded_at = stamp.stamped_at
   AND usr.created_at < stamp.stamped_at;

-- Down Migration

-- Nothing to restore: the stamped instant carried no information. Every
-- account that can sign in is still onboarded, and a placeholder is stamped
-- when its person finishes the first-run flow.
SELECT 1;

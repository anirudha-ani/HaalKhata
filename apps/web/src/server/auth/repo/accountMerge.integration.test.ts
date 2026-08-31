/**
 * Integration test for the account merge, run against a real Postgres.
 *
 * The unit tests around it are all mocks, which prove the decision tree but
 * never execute a single statement. This one seeds every hazard the merge has
 * to handle simultaneously — double splits, overlapping memberships,
 * bidirectional friendships, pending friend requests, a settlement between
 * the two rows, a JSONB audience, a soft-deleted expense — and checks what
 * the database actually contains afterwards.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_merge_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const KEEPER = "keeper-1";
const LOSER = "loser-1";
const RAHUL = "rahul-1";
const PHONE = "+16175551212";

/**
 * Checks whether the admin database accepts a connection.
 *
 * @returns True when the suite can run.
 */
async function databaseReachable(): Promise<boolean> {
  const client = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("mergeAccounts against Postgres", () => {
  let database: Client;
  let mergeAccounts: typeof import("./accountMerge.repo").mergeAccounts;
  let closePool: () => Promise<void>;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    // Set before importing db.ts, which reads DATABASE_URL when it first
    // builds the pool.
    process.env.DATABASE_URL = TEST_URL;
    const dbModule = await import("@/server/common/db");
    await dbModule.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({ mergeAccounts } = await import("./accountMerge.repo"));

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await seed(database);
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("absorbs the invited row and leaves the balance invariant intact", async () => {
    // The invariant assertion lives inside the transaction, so a wrong repoint
    // surfaces as a rejection here rather than as quietly wrong money.
    const outcome = await mergeAccounts(KEEPER, LOSER, PHONE);

    expect(outcome.selfSettlementsRemoved).toBe(1);
    expect(outcome.duplicateSplitsSummed).toBe(1);
  });

  it("sums the shares of an expense both rows appeared in", async () => {
    const { rows } = await database.query(
      `SELECT user_id, owed_cents FROM expense_splits WHERE expense_id = 'exp-1' ORDER BY user_id`,
    );
    // 1000 as the keeper + 1000 as the invited row, one row, cent-exact.
    expect(rows).toEqual([
      { user_id: KEEPER, owed_cents: 2000 },
      { user_id: RAHUL, owed_cents: 1000 },
    ]);
  });

  it("repoints splits on soft-deleted expenses too", async () => {
    const { rows } = await database.query(
      `SELECT owed_cents FROM expense_splits WHERE expense_id = 'exp-3' AND user_id = $1`,
      [KEEPER],
    );
    expect(rows).toEqual([{ owed_cents: 900 }]);
  });

  it("keeps one group membership and carries the stronger role across", async () => {
    const { rows } = await database.query(
      `SELECT user_id, role FROM group_members WHERE group_id = 'grp-1' ORDER BY user_id`,
    );
    expect(rows).toEqual([
      { user_id: KEEPER, role: "owner" },
      { user_id: RAHUL, role: "member" },
    ]);
  });

  it("enforces authorization roles and distinct settlement parties in Postgres", async () => {
    await expect(
      database.query(`UPDATE group_members SET role = 'admin' WHERE group_id = 'grp-1'`),
    ).rejects.toMatchObject({ constraint: "chk_group_members_role" });
    await expect(
      database.query(
        `INSERT INTO settlements
           (id, from_user, to_user, amount_cents, currency, method, recorded_by)
         VALUES ('stl-self', $1, $1, 100, 'USD', 'cash', $1)`,
        [KEEPER],
      ),
    ).rejects.toMatchObject({ constraint: "chk_settlements_distinct_users" });
  });

  it("leaves no self-friendship and no duplicate friendship", async () => {
    const { rows } = await database.query(
      `SELECT user_id, friend_id FROM friendships ORDER BY user_id, friend_id`,
    );
    expect(rows).toEqual([
      { user_id: KEEPER, friend_id: RAHUL },
      { user_id: RAHUL, friend_id: KEEPER },
    ]);
  });

  it("repoints pending friend requests without duplicates or self-requests", async () => {
    const { rows } = await database.query(
      `SELECT requester_id, recipient_id
         FROM friend_requests
        ORDER BY requester_id, recipient_id`,
    );
    expect(rows).toEqual([
      { requester_id: KEEPER, recipient_id: RAHUL },
      { requester_id: RAHUL, recipient_id: KEEPER },
    ]);
  });

  it("deletes money paid between the two rows and repoints the rest", async () => {
    const { rows } = await database.query(
      `SELECT id, from_user, to_user, recorded_by FROM settlements ORDER BY id`,
    );
    expect(rows).toEqual([
      { id: "stl-2", from_user: RAHUL, to_user: KEEPER, recorded_by: KEEPER },
    ]);
  });

  it("moves idempotency history to the surviving account", async () => {
    const { rows } = await database.query(
      `SELECT user_id, rpc, operation_id FROM operations ORDER BY operation_id`,
    );
    expect(rows).toEqual([
      { user_id: KEEPER, rpc: "CreateExpense", operation_id: "operation-1" },
    ]);
  });

  it("rewrites the JSONB audience and the unconstrained credit_user_id", async () => {
    const { rows } = await database.query(
      `SELECT actor_id, audience, credit_user_id FROM activity WHERE id = 'act-1'`,
    );
    expect(rows[0].actor_id).toBe(KEEPER);
    expect(rows[0].credit_user_id).toBe(KEEPER);
    // Deduplicated: the array named both rows, which are now one person.
    expect([...rows[0].audience].sort()).toEqual([KEEPER, RAHUL]);
  });

  it("keeps the account's own payment handles and adopts the rest", async () => {
    const { rows } = await database.query(
      `SELECT method, handle FROM payment_handles WHERE user_id = $1 ORDER BY method`,
      [KEEPER],
    );
    expect(rows).toEqual([
      { method: "venmo", handle: "keeper-venmo" },
      { method: "zelle", handle: "loser-zelle" },
    ]);
  });

  it("moves the phone across and tombstones the absorbed row", async () => {
    const { rows } = await database.query(
      `SELECT id, phone, merged_into FROM users WHERE id = ANY($1::text[]) ORDER BY id`,
      [[KEEPER, LOSER]],
    );
    expect(rows).toEqual([
      { id: KEEPER, phone: PHONE, merged_into: null },
      { id: LOSER, phone: null, merged_into: KEEPER },
    ]);
  });

  it("leaves nothing anywhere still pointing at the absorbed row", async () => {
    const { rows } = await database.query(
      `SELECT
         (SELECT COUNT(*) FROM expense_splits WHERE user_id = $1)
       + (SELECT COUNT(*) FROM expense_payers WHERE user_id = $1)
       + (SELECT COUNT(*) FROM expense_item_assignments WHERE user_id = $1)
       + (SELECT COUNT(*) FROM group_members WHERE user_id = $1)
       + (SELECT COUNT(*) FROM friendships WHERE user_id = $1 OR friend_id = $1)
       + (SELECT COUNT(*) FROM friend_requests WHERE requester_id = $1 OR recipient_id = $1)
       + (SELECT COUNT(*) FROM settlements WHERE from_user = $1 OR to_user = $1)
       + (SELECT COUNT(*) FROM settlements WHERE recorded_by = $1 OR deleted_by = $1)
       + (SELECT COUNT(*) FROM comments WHERE user_id = $1)
       + (SELECT COUNT(*) FROM activity WHERE actor_id = $1 OR credit_user_id = $1
            OR audience @> to_jsonb($1::text))
       + (SELECT COUNT(*) FROM notifications WHERE user_id = $1)
       + (SELECT COUNT(*) FROM payment_handles WHERE user_id = $1)
       + (SELECT COUNT(*) FROM operations WHERE user_id = $1)
       + (SELECT COUNT(*) FROM expenses WHERE created_by = $1 OR deleted_by = $1)
       + (SELECT COUNT(*) FROM groups WHERE created_by = $1) AS dangling`,
      [LOSER],
    );
    expect(Number(rows[0].dangling)).toBe(0);
  });
});

/**
 * Seeds two rows for one person plus a third party, arranged so that every
 * collision the merge has to resolve is present at once.
 *
 * @param database - Connected client for the scratch database.
 */
async function seed(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color, password_hash, phone, google_sub, onboarded_at)
     VALUES
       ($1, 'me@example.com', 'Anirudha', '#c73e2e', NULL, NULL, 'google-sub-1', now()),
       ($2, NULL, 'Ani', '#0f8a5f', NULL, $4, NULL, NULL),
       ($3, 'rahul@example.com', 'Rahul', '#1d4ed8', NULL, NULL, 'google-sub-2', now())`,
    [KEEPER, LOSER, RAHUL, PHONE],
  );

  await database.query(
    `INSERT INTO groups (id, name, created_by) VALUES ('grp-1', 'Trip', $1)`,
    [LOSER],
  );
  await database.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES
       ('grp-1', $1, 'member'), ('grp-1', $2, 'owner'), ('grp-1', $3, 'member')`,
    [KEEPER, LOSER, RAHUL],
  );

  // exp-1: both rows are participants — the double-split hazard.
  await database.query(
    `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ('exp-1', 'grp-1', 'Dinner', 3000, 'USD', '2026-07-01', 'equal', $1)`,
    [RAHUL],
  );
  await database.query(
    `INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ('exp-1', $1, 3000)`,
    [RAHUL],
  );
  await database.query(
    `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES
       ('exp-1', $1, 1000), ('exp-1', $2, 1000), ('exp-1', $3, 1000)`,
    [KEEPER, LOSER, RAHUL],
  );
  await database.query(
    `INSERT INTO expense_items (id, expense_id, name, total_cents) VALUES ('itm-1', 'exp-1', 'Curry', 3000)`,
  );
  await database.query(
    `INSERT INTO expense_item_assignments (item_id, user_id, weight) VALUES
       ('itm-1', $1, 1), ('itm-1', $2, 1)`,
    [KEEPER, LOSER],
  );

  // exp-2: only the invited row is involved, and it paid.
  await database.query(
    `INSERT INTO expenses (id, description, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ('exp-2', 'Taxi', 1000, 'USD', '2026-07-02', 'equal', $1)`,
    [LOSER],
  );
  await database.query(
    `INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ('exp-2', $1, 1000)`,
    [LOSER],
  );
  await database.query(
    `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ('exp-2', $1, 500), ('exp-2', $2, 500)`,
    [LOSER, RAHUL],
  );

  // exp-3 is soft-deleted; its splits must still repoint.
  await database.query(
    `INSERT INTO expenses
       (id, description, amount_cents, currency, expense_date, split_type, created_by, deleted_at, deleted_by)
     VALUES ('exp-3', 'Cancelled', 900, 'USD', '2026-07-03', 'equal', $1, now(), $2)`,
    [RAHUL, LOSER],
  );
  await database.query(
    `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ('exp-3', $1, 900)`,
    [LOSER],
  );

  // stl-1 is between the two rows: money paid to oneself once merged.
  await database.query(
    `INSERT INTO settlements (id, from_user, to_user, amount_cents, currency, recorded_by) VALUES
       ('stl-1', $1, $2, 500, 'USD', $1), ('stl-2', $3, $2, 200, 'USD', $2)`,
    [KEEPER, LOSER, RAHUL],
  );

  await database.query(
    `INSERT INTO operations (user_id, rpc, operation_id, request_fingerprint, result_id)
     VALUES ($1, 'CreateExpense', 'operation-1', 'fingerprint', 'exp-2')`,
    [LOSER],
  );

  // Overlapping both ways, plus the pair that would become a self-loop and
  // trip chk_friendship_self.
  await database.query(
    `INSERT INTO friendships (user_id, friend_id) VALUES
       ($1, $3), ($3, $1), ($2, $3), ($3, $2), ($1, $2), ($2, $1)`,
    [KEEPER, LOSER, RAHUL],
  );

  // Duplicate incoming and outgoing requests collapse onto the keeper; the
  // two requests between keeper and loser disappear as self-requests.
  await database.query(
    `INSERT INTO friend_requests (requester_id, recipient_id) VALUES
       ($1, $3), ($2, $3), ($3, $1), ($3, $2), ($1, $2), ($2, $1)`,
    [KEEPER, LOSER, RAHUL],
  );

  await database.query(
    `INSERT INTO payment_handles (user_id, method, handle) VALUES
       ($1, 'venmo', 'keeper-venmo'), ($2, 'venmo', 'loser-venmo'), ($2, 'zelle', 'loser-zelle')`,
    [KEEPER, LOSER],
  );

  await database.query(
    `INSERT INTO activity (id, actor_id, type, message, audience, credit_user_id)
     VALUES ('act-1', $1, 'settlement', 'settled up', $2::jsonb, $1)`,
    [LOSER, JSON.stringify([KEEPER, LOSER, RAHUL])],
  );
  await database.query(
    `INSERT INTO comments (id, expense_id, user_id, body) VALUES ('cmt-1', 'exp-1', $1, 'thanks')`,
    [LOSER],
  );
  await database.query(
    `INSERT INTO notifications (id, user_id, type, title)
     VALUES ('ntf-1', $1, 'expense_added', 'New expense')`,
    [LOSER],
  );
}

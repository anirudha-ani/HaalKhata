/**
 * Real PostgreSQL regression: what recording a payment locks, and for how
 * long. One person in hundreds of groups must not make a payment lock all
 * of them; a payment to somebody owed nothing takes no lock at all; a lock
 * held too long is answered as busy with nothing saved; and nobody can be in
 * more groups than the cap.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

vi.mock("@/server/common/ledger/ledgerLocks.constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/common/ledger/ledgerLocks.constants")>()),
  // Short, so the test of a lock held too long finishes quickly.
  LEDGER_LOCK_TIMEOUT_MS: 400,
}));

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_settlement_locks_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const PAYER = "locks-payer";
const CREDITOR = "locks-creditor";
const STRANGER = "locks-stranger";
const SHARED_GROUP = "locks-shared";
/** Groups the payer is in alone; with the shared one, the cap exactly. */
const PAYER_SOLO_GROUPS = 199;
/** Groups the creditor is in alone. */
const CREDITOR_SOLO_GROUPS = 50;

/**
 * Checks database availability while always closing the probe connection.
 * @returns Whether the isolated PostgreSQL suite can run.
 */
async function databaseReachable(): Promise<boolean> {
  const probe = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

/**
 * Three people; one group the payer and creditor share, where the payer owes
 * 50.00; the payer in 199 groups of their own and a deleted one; the
 * creditor in 50 of their own.
 *
 * @param database - Connection to the migrated test database.
 */
async function seed(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub) VALUES
       ($1, 'payer@example.com', 'Pat Payer', '#c73e2e', now(), 'google-locks-payer'),
       ($2, 'creditor@example.com', 'Cleo Creditor', '#0f8a5f', now(), 'google-locks-creditor'),
       ($3, 'stranger@example.com', 'Sam Stranger', '#1d4ed8', now(), 'google-locks-stranger')`,
    [PAYER, CREDITOR, STRANGER],
  );
  await database.query(`INSERT INTO groups (id, name, created_by) VALUES ($1, 'Flat', $2)`, [SHARED_GROUP, CREDITOR]);
  await database.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member'), ($1, $3, 'owner')`,
    [SHARED_GROUP, PAYER, CREDITOR],
  );
  await database.query(
    `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ('locks-rent', $1, 'Rent share', 10000, 'USD', '2026-10-01', 'equal', $2)`,
    [SHARED_GROUP, CREDITOR],
  );
  await database.query(`INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ('locks-rent', $1, 10000)`, [CREDITOR]);
  await database.query(
    `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ('locks-rent', $1, 5000), ('locks-rent', $2, 5000)`,
    [PAYER, CREDITOR],
  );
  for (const [owner, count] of [[PAYER, PAYER_SOLO_GROUPS], [CREDITOR, CREDITOR_SOLO_GROUPS]] as const) {
    await database.query(
      `INSERT INTO groups (id, name, created_by)
         SELECT $1 || '-solo-' || lpad(number::text, 3, '0'), 'Solo', $1 FROM generate_series(1, $2) AS number`,
      [owner, count],
    );
    await database.query(
      `INSERT INTO group_members (group_id, user_id, role)
         SELECT $1 || '-solo-' || lpad(number::text, 3, '0'), $1, 'owner' FROM generate_series(1, $2) AS number`,
      [owner, count],
    );
  }
  await database.query(`INSERT INTO groups (id, name, created_by, status) VALUES ('locks-gone', 'Gone', $1, 'deleted')`, [PAYER]);
  await database.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ('locks-gone', $1, 'owner')`, [PAYER]);
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("what recording a payment locks, against Postgres", () => {
  let database: Client;
  let blocker: Client;
  let recordSettlement: typeof import("./expense.usecase").recordSettlement;
  let createGroup: typeof import("@/server/group/usecase/group.usecase").createGroup;
  let closePool: () => Promise<void>;

  /**
   * A payment from the payer, with its own operation id.
   *
   * @param toUserId - Who is being paid.
   * @param amountCents - How much.
   * @param operationId - The client's operation id; a fresh one by default.
   * @returns What recordSettlement returns.
   */
  const payTo = (toUserId: string, amountCents: number, operationId = randomUUID()) =>
    recordSettlement(PAYER, {
      groupId: "",
      toUserId,
      amountCents,
      currency: "USD",
      method: "cash",
      note: "",
      operationId,
    });

  /**
   * Holds one advisory lock on the blocker connection until it commits.
   *
   * @param lockKey - The lock's name, as the ledger code names it.
   */
  const hold = async (lockKey: string) => {
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
  };

  /**
   * Waits until some other connection to this test's database is waiting on
   * an advisory lock. Other suites share the server, so the database is part
   * of the question.
   *
   * @returns That connection's backend id.
   */
  const waitingBackend = async (): Promise<number> => {
    for (let poll = 0; poll < 100; poll++) {
      const { rows } = await database.query<{ pid: number }>(
        `SELECT pid FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
          LIMIT 1`,
      );
      if (rows[0]) return rows[0].pid;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("no connection started waiting on a lock");
  };

  /**
   * What a pending call comes to within a time limit, without leaving it
   * unhandled when the limit wins.
   *
   * @param pending - The call.
   * @param limitMs - How long to wait.
   * @returns Its result or error, or "still waiting".
   */
  const within = (pending: Promise<unknown>, limitMs: number) =>
    Promise.race([
      pending.then((result) => result, (error: unknown) => error),
      new Promise((resolve) => setTimeout(() => resolve("still waiting"), limitMs)),
    ]);

  /** How many payments the payer has made to the creditor. */
  const paymentsMade = async (): Promise<number> => {
    const { rows } = await database.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM settlements WHERE from_user = $1 AND to_user = $2 AND deleted_at IS NULL",
      [PAYER, CREDITOR],
    );
    return rows[0].total;
  };

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    // Set before importing db.ts, which reads DATABASE_URL when it first
    // builds the pool.
    process.env.DATABASE_URL = TEST_URL;
    const dbModule = await import("@/server/common/db/db");
    await dbModule.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({ recordSettlement } = await import("./expense.usecase"));
    ({ createGroup } = await import("@/server/group/usecase/group.usecase"));

    database = new Client({ connectionString: TEST_URL });
    blocker = new Client({ connectionString: TEST_URL });
    await Promise.all([database.connect(), blocker.connect()]);
    await seed(database);
  }, 60_000);

  afterAll(async () => {
    await blocker?.query("ROLLBACK").catch(() => undefined);
    await blocker?.end();
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("holds only the two people's locks while it waits on the one group they share", async () => {
    await hold(`ledger:group:${SHARED_GROUP}`);
    const payment = payTo(CREDITOR, 1000);
    let held: number;
    try {
      const backend = await waitingBackend();
      // Everything it holds is everything it took before reaching the shared
      // group. Locking every group either person is in, the payer's 199 and
      // the creditor's 50 all sort ahead of the shared one.
      const { rows } = await database.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM pg_locks WHERE locktype = 'advisory' AND granted AND pid = $1",
        [backend],
      );
      held = rows[0].total;
    } finally {
      await blocker.query("COMMIT");
    }

    expect(held).toBe(2);
    await expect(payment).resolves.toMatchObject({ amountCents: 1000 });
  });

  it("refuses a payment to somebody owed nothing without waiting on any lock", async () => {
    await hold(`ledger:participant:${PAYER}`);
    const payment = payTo(STRANGER, 1000);
    const outcome = await within(payment, 300);
    await blocker.query("COMMIT");
    await payment.catch(() => undefined);

    expect(outcome).toBeInstanceOf(Error);
    expect(String((outcome as Error).message)).toMatch(/don't owe this person anything/);
  });

  it("answers a lock held too long as busy, and saves nothing", async () => {
    const before = await paymentsMade();
    await hold(`ledger:group:${SHARED_GROUP}`);
    const payment = payTo(CREDITOR, 1000);
    const outcome = await within(payment, 3000);
    await blocker.query("COMMIT");
    await payment.catch(() => undefined);

    expect(outcome).toMatchObject({ code: "unavailable", message: expect.stringMatching(/nothing was saved/) });
    expect(await paymentsMade()).toBe(before);
  });

  it("replays a retried payment after the debt it paid is gone, instead of refusing it", async () => {
    const operationId = randomUUID();
    const first = await payTo(CREDITOR, 4000, operationId);

    const retry = await payTo(CREDITOR, 4000, operationId);

    expect(retry.id).toBe(first.id);
    await expect(payTo(CREDITOR, 1000)).rejects.toThrow(/don't owe this person anything/);
  });

  it("stops anyone joining a group past the cap, counting archived groups and not deleted ones", async () => {
    // The payer is in 200 groups: 199 alone and the shared one. The deleted one does not count.
    await expect(createGroup(PAYER, { name: "One more", type: "trip", currency: "USD" })).rejects.toThrow(
      /you're in 200 groups/,
    );
    await expect(
      createGroup(CREDITOR, { name: "Weekend", type: "trip", currency: "USD", memberIds: [PAYER] }),
    ).rejects.toThrow(/Pat Payer is in 200 groups/);
    const { rows } = await database.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM groups WHERE name = 'Weekend'",
    );
    expect(rows[0].total).toBe(0);

    await database.query("UPDATE groups SET status = 'archived' WHERE id = $1", [`${PAYER}-solo-001`]);
    await expect(createGroup(PAYER, { name: "Still full", type: "trip", currency: "USD" })).rejects.toThrow(
      /you're in 200 groups/,
    );
    await database.query("UPDATE groups SET status = 'deleted' WHERE id = $1", [`${PAYER}-solo-001`]);
    await expect(createGroup(PAYER, { name: "Room now", type: "trip", currency: "USD" })).resolves.toMatchObject({
      name: "Room now",
    });
  });
});

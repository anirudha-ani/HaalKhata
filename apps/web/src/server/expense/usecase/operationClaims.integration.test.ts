/**
 * Real PostgreSQL regression: the claims that make money writes safe to
 * retry never make two writes wait on each other. An expense and a payment
 * that share a person both go through however they interleave, where
 * clearing out old claims inside each write once deadlocked them. A retry
 * of a recorded payment is answered at once, even while the pair is busy. A
 * reused id runs again after a day, swept or not. Old claims are cleared in
 * the background in small batches, skipping any a write is using.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PARTICIPANT_LEDGER_LOCK_PREFIX } from "@/server/common/ledger/ledgerLocks.constants";
import { testDatabaseName } from "@/server/common/testing/testDatabase";
import type { ExpenseInput } from "./expense.usecase";

vi.mock("@/server/common/ledger/operations.constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/common/ledger/operations.constants")>()),
  // Small, so a handful of old claims takes several batches.
  OPERATION_SWEEP_BATCH_SIZE: 2,
}));

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_operation_claims_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

// Ids in this order, so each write takes its two people's locks in the
// order the interleaving below needs: Rahim before Sara before Tomas.
const RAHIM = "claims-1-rahim";
const SARA = "claims-2-sara";
const TOMAS = "claims-3-tomas";

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
 * Three people: Rahim and Sara are friends, Sara and Tomas are friends, and
 * Sara owes Tomas 30.00 from a dinner outside any group. One claim from
 * yesterday is past retention, as there always is one in a running app.
 *
 * @param database - Connection to the migrated test database.
 */
async function seed(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub) VALUES
       ($1, 'rahim@example.com', 'Rahim Raza', '#c73e2e', now(), 'google-claims-rahim'),
       ($2, 'sara@example.com', 'Sara Silva', '#0f8a5f', now(), 'google-claims-sara'),
       ($3, 'tomas@example.com', 'Tomas Tan', '#1d4ed8', now(), 'google-claims-tomas')`,
    [RAHIM, SARA, TOMAS],
  );
  await database.query(
    "INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1), ($2, $3), ($3, $2)",
    [RAHIM, SARA, TOMAS],
  );
  await database.query(
    `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ('claims-dinner', NULL, 'Dinner', 6000, 'USD', '2026-10-01', 'equal', $1)`,
    [TOMAS],
  );
  await database.query("INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ('claims-dinner', $1, 6000)", [TOMAS]);
  await database.query(
    "INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ('claims-dinner', $1, 3000), ('claims-dinner', $2, 3000)",
    [SARA, TOMAS],
  );
  await database.query(
    `INSERT INTO operations (user_id, rpc, operation_id, request_fingerprint, result_id, created_at)
     VALUES ($1, 'CreateExpense', 'yesterday', 'fingerprint', 'claims-dinner', now() - interval '25 hours')`,
    [TOMAS],
  );
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("operation claims never make money writes wait on each other, against Postgres", () => {
  let database: Client;
  let blocker: Client;
  let usecase: typeof import("./expense.usecase");
  let closePool: () => Promise<void>;

  /**
   * Sara pays Tomas, outside any group.
   *
   * @param amountCents - How much.
   * @param operationId - The client's operation id; a fresh one by default.
   * @returns What recordSettlement returns.
   */
  const saraPaysTomas = (amountCents: number, operationId = randomUUID()) =>
    usecase.recordSettlement(SARA, {
      groupId: "",
      toUserId: TOMAS,
      amountCents,
      currency: "USD",
      method: "cash",
      note: "",
      operationId,
    });

  /**
   * A taxi Rahim paid and split evenly with Sara, outside any group.
   *
   * @param operationId - The client's operation id; a fresh one by default.
   * @returns A create request.
   */
  const taxi = (operationId = randomUUID()): ExpenseInput =>
    ({
      groupId: "", description: "Taxi", amountCents: 2000, currency: "USD",
      category: "transport", expenseDate: "2026-10-27", splitType: "equal", notes: "",
      payers: [{ userId: RAHIM, amountCents: 2000 }],
      splitSpecs: [RAHIM, SARA].map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })),
      items: [], taxCents: 0, tipCents: 0, operationId,
    }) as unknown as ExpenseInput;

  /**
   * Holds one person's ledger lock on the blocker connection until it commits.
   *
   * @param personId - Whose lock.
   */
  const holdLedgerOf = async (personId: string) => {
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${PARTICIPANT_LEDGER_LOCK_PREFIX}${personId}`]);
  };

  /**
   * Waits until this many connections to this test's database are waiting
   * on an advisory lock. Other suites share the server, so the database is
   * part of the question.
   *
   * @param count - How many waiters to wait for.
   */
  const waitForWaiters = async (count: number) => {
    for (let poll = 0; poll < 150; poll++) {
      const { rows } = await database.query<{ waiting: number }>(
        `SELECT count(*)::int AS waiting FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      );
      if (rows[0].waiting >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`fewer than ${count} connections started waiting on a lock`);
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

  /**
   * What a settled call came to: "saved", or the error's Postgres code or message.
   *
   * @param outcome - The settled call.
   * @returns A short description.
   */
  const outcomeOf = (outcome: PromiseSettledResult<unknown>) =>
    outcome.status === "fulfilled"
      ? "saved"
      : ((outcome.reason as { code?: string }).code ?? String(outcome.reason));

  /** How many payments Sara has made to Tomas. */
  const saraPayments = async (): Promise<number> => {
    const { rows } = await database.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM settlements WHERE from_user = $1 AND to_user = $2 AND deleted_at IS NULL",
      [SARA, TOMAS],
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
    usecase = await import("./expense.usecase");

    database = new Client({ connectionString: TEST_URL });
    blocker = new Client({ connectionString: TEST_URL });
    await Promise.all([database.connect(), blocker.connect()]);
    await seed(database);
  }, 60_000);

  afterAll(async () => {
    await blocker?.end();
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("saves both an expense and a payment that share a person, however they interleave", async () => {
    // Sara's payment takes her lock, then waits on Tomas's. Rahim's taxi with
    // Sara then waits on Sara's. When Tomas's lock frees, the payment goes
    // on to claim its id while the taxi still waits — the moment two writes
    // that each cleared out old claims locked each other up.
    await holdLedgerOf(TOMAS);
    const payment = saraPaysTomas(1000);
    await waitForWaiters(1);
    const expense = usecase.createExpense(RAHIM, taxi());
    await waitForWaiters(2);
    await blocker.query("COMMIT");

    const outcomes = await Promise.allSettled([payment, expense]);

    expect(outcomes.map(outcomeOf)).toEqual(["saved", "saved"]);
    // Neither write cleared out yesterday's claim; that is the sweep's job.
    const { rows } = await database.query("SELECT 1 FROM operations WHERE operation_id = 'yesterday'");
    expect(rows).toHaveLength(1);
  });

  it("answers a retry of a recorded payment at once, even while the pair is busy", async () => {
    const operationId = randomUUID();
    const recorded = await saraPaysTomas(500, operationId);
    const before = await saraPayments();

    await holdLedgerOf(TOMAS);
    const retry = saraPaysTomas(500, operationId);
    try {
      expect(await within(retry, 2000)).toMatchObject({ id: recorded.id });
    } finally {
      await blocker.query("COMMIT");
      await retry.catch(() => undefined);
    }
    expect(await saraPayments()).toBe(before);
  });

  it("runs a reused id again once its claim is a day old, swept or not", async () => {
    const operationId = randomUUID();
    const first = await usecase.createExpense(RAHIM, taxi(operationId));

    await expect(usecase.createExpense(RAHIM, taxi(operationId))).resolves.toMatchObject({ id: first.id });

    await database.query("UPDATE operations SET created_at = now() - interval '25 hours' WHERE operation_id = $1", [operationId]);
    const later = await usecase.createExpense(RAHIM, taxi(operationId));
    expect(later.id).not.toBe(first.id);
    const { rows } = await database.query<{ result_id: string }>(
      "SELECT result_id FROM operations WHERE operation_id = $1",
      [operationId],
    );
    expect(rows).toEqual([{ result_id: later.id }]);
  });

  it("clears old claims in the background, a few at a time, skipping one a write is using", async () => {
    const { sweepExpiredOperations } = await import("@/server/common/ledger/operationsSweep");
    await database.query(
      `INSERT INTO operations (user_id, rpc, operation_id, request_fingerprint, created_at)
         SELECT $1, 'CreateExpense', 'old-' || number, 'fingerprint', now() - interval '2 days'
           FROM generate_series(1, 5) AS number`,
      [RAHIM],
    );
    const counts = async () =>
      (
        await database.query<{ expired: number; current: number }>(
          `SELECT count(*) FILTER (WHERE created_at < now() - interval '24 hours')::int AS expired,
                  count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS current
             FROM operations`,
        )
      ).rows[0];
    const before = await counts();
    expect(before.expired).toBeGreaterThan(5);

    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM operations WHERE operation_id = 'old-1' FOR UPDATE");
    try {
      expect(await within(sweepExpiredOperations(), 2000)).toBe(before.expired - 1);
      expect(await counts()).toEqual({ expired: 1, current: before.current });
    } finally {
      await blocker.query("COMMIT");
    }

    await expect(sweepExpiredOperations()).resolves.toBe(1);
    expect(await counts()).toEqual({ expired: 0, current: before.current });
  });
});

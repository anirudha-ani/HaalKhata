/**
 * Real PostgreSQL regression for audit A05: a one-off expense that was
 * already waiting for a participant's ledger lock when the friendship it
 * relies on was removed must not run. Writing it would put the removed
 * friend back into debt and quietly re-create the friendship.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreateExpenseRequest } from "@haalkhata/protogen/expense/v1/expense_pb";
import { PARTICIPANT_LEDGER_LOCK_PREFIX } from "@/server/common/ledger/ledgerLocks.constants";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_one_off_removal_race_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const ALICE = "race-alice";
const BOBBY = "race-bobby";

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
    await probe.end();
  }
}

/**
 * A taxi Alice paid for, split evenly with Bobby.
 * @returns A one-off create request with a fresh operation id.
 */
function taxiRequest(): CreateExpenseRequest {
  return {
    groupId: "", description: "Taxi", amountCents: 4000, currency: "USD",
    category: "transport", expenseDate: "2026-10-20", splitType: "exact", notes: "",
    payers: [{ userId: ALICE, amountCents: 4000 }],
    splitSpecs: [
      { userId: ALICE, amountCents: 2000, percentBp: 0, shares: 0 },
      { userId: BOBBY, amountCents: 2000, percentBp: 0, shares: 0 },
    ],
    items: [], taxCents: 0, tipCents: 0, operationId: randomUUID(),
  } as unknown as CreateExpenseRequest;
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("one-off expenses while a friend removal holds the ledger lock", () => {
  let database: Client;
  let createExpense: typeof import("./expense.usecase").createExpense;
  let updateExpense: typeof import("./expense.usecase").updateExpense;
  let closePool: () => Promise<void>;

  /**
   * Waits until a server transaction is queued behind the test's lock.
   * Reads pg_locks alone: inside the test's open transaction,
   * pg_stat_activity is a snapshot from first use and would miss the
   * request's connection if that opened afterwards.
   *
   * @returns A promise resolving once one is waiting; throws on timeout.
   */
  async function waitForQueuedWrite(): Promise<void> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const waiting = await database.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      );
      if (waiting.rows[0].total >= 1) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("expected a write waiting on the participant lock");
  }

  /**
   * Runs a write that passes its first checks and then queues behind a
   * friend removal holding Bobby's ledger lock, which commits first.
   *
   * @param write - The expense write Alice started.
   * @returns How the queued write ended.
   */
  async function writeQueuedBehindRemoval(write: () => Promise<unknown>) {
    await database.query("BEGIN");
    await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${PARTICIPANT_LEDGER_LOCK_PREFIX}${BOBBY}`,
    ]);
    const queued = write().then(
      () => ({ outcome: "written" as const }),
      (error: unknown) => ({ outcome: "refused" as const, error }),
    );
    await waitForQueuedWrite();
    // Bobby removes Alice under the lock the write is waiting for.
    await database.query(
      "DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)",
      [ALICE, BOBBY],
    );
    await database.query("COMMIT");
    return queued;
  }

  /** @returns How many friendship rows join Alice and Bobby. */
  async function friendshipRows(): Promise<number> {
    const { rows } = await database.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM friendships WHERE user_id IN ($1, $2) AND friend_id IN ($1, $2)",
      [ALICE, BOBBY],
    );
    return rows[0].total;
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    await (await import("@/server/common/db/db")).ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({ createExpense, updateExpense } = await import("./expense.usecase"));
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, google_sub) VALUES
       ($1, 'race-alice@example.com', 'Alice', '#336699', 'google-race-alice'),
       ($2, 'race-bobby@example.com', 'Bobby', '#336699', 'google-race-bobby')`,
      [ALICE, BOBBY],
    );
  }, 60_000);

  beforeEach(async () => {
    await database.query("TRUNCATE expenses, settlements, activity, notifications, operations CASCADE");
    await database.query("DELETE FROM friendships");
    await database.query("INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1)", [ALICE, BOBBY]);
  });

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("refuses a new expense queued behind the removal, and leaves them unfriended and owing nothing", async () => {
    const result = await writeQueuedBehindRemoval(() => createExpense(ALICE, taxiRequest()));

    expect(result).toMatchObject({ outcome: "refused", error: { code: "permission_denied" } });
    expect((await database.query("SELECT id FROM expenses")).rows).toEqual([]);
    expect(await friendshipRows()).toBe(0);
  });

  it("refuses an edit queued behind the removal", async () => {
    const saved = await createExpense(ALICE, taxiRequest());
    const edited = { ...taxiRequest(), description: "Taxi home" } as CreateExpenseRequest;

    const result = await writeQueuedBehindRemoval(() => updateExpense(ALICE, saved.id, edited));

    expect(result).toMatchObject({ outcome: "refused", error: { code: "permission_denied" } });
    const { rows } = await database.query("SELECT description FROM expenses WHERE id = $1", [saved.id]);
    expect(rows).toEqual([{ description: "Taxi" }]);
  });

  it("still writes for people who stay friends", async () => {
    await createExpense(ALICE, taxiRequest());

    expect((await database.query("SELECT description FROM expenses")).rows).toEqual([{ description: "Taxi" }]);
    expect(await friendshipRows()).toBe(2);
  });
});

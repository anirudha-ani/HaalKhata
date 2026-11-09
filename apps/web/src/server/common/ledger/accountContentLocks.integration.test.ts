/** Real PostgreSQL races between a bill payment and removal of its captured title. */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseName } from "../testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_content_race");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const MODERATION_CONTAINER = process.env.MODERATION_TEST_CONTAINER;

/** @returns Whether the local disposable test database is available. */
async function reachable(): Promise<boolean> {
  const client = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try { await client.connect(); return true; }
  catch { return false; }
  finally { await client.end(); }
}

/**
 * Runs the documented operator removal against this suite's private database.
 * @param reportId Report whose bill title must be erased.
 * @returns Resolves when the operator transaction has committed.
 */
function operatorRemoval(reportId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile("docker", [
      "exec", "-i", MODERATION_CONTAINER!, "psql", "-U", "haalkhata", "-d", TEST_DATABASE,
      "-v", "ON_ERROR_STOP=1", "-v", "action=remove", "-v", `report_id=${reportId}`,
    ], (error) => error ? reject(error) : resolve());
    child.stdin!.end(readFileSync(new URL("../../safety/repo/moderation.sql", import.meta.url)));
  });
}

describe.skipIf(!await reachable())("payment titles during content erasure", () => {
  let database: Client;
  let record: typeof import("@/server/expense/usecase/expense.usecase").recordSettlement;
  let erase: typeof import("@/server/auth/usecase/deletion/accountDeletion.usecase").deleteAccount;
  let moderate: typeof import("@/server/adminmoderation/usecase/moderation.usecase").removeReportedContent;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    await (await import("../db/db")).ensureMigrated();
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    record = (await import("@/server/expense/usecase/expense.usecase")).recordSettlement;
    erase = (await import("@/server/auth/usecase/deletion/accountDeletion.usecase")).deleteAccount;
    moderate = (await import("@/server/adminmoderation/usecase/moderation.usecase")).removeReportedContent;
  }, 60000);

  afterAll(async () => {
    await database?.end();
    await (globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } }).__haalkhataPool?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  /**
   * Creates a bill whose author is separate from the two surviving money participants.
   * @returns Unique participants, expense and report for one race.
   */
  async function fixture() {
    const author = randomUUID(), payer = randomUUID(), payee = randomUUID();
    const groupId = randomUUID(), expenseId = randomUUID(), reportId = randomUUID();
    await database.query(`INSERT INTO users (id, name, email, google_sub, avatar_color)
      SELECT person, 'Member', person || '@example.test', person, '#778899' FROM unnest($1::text[]) person`, [[author, payer, payee]]);
    await database.query("INSERT INTO groups (id, name, created_by) VALUES ($1, 'Private', $2)", [groupId, author]);
    await database.query(`INSERT INTO group_members (group_id, user_id, role) VALUES
      ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`, [groupId, author, payer, payee]);
    await database.query(`INSERT INTO expenses (id, group_id, created_by, description, amount_cents, currency, expense_date, split_type)
      VALUES ($1, $2, $3, 'Private title', 1000, 'USD', '2026-11-08', 'exact')`, [expenseId, groupId, author]);
    await database.query("INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ($1, $2, 1000)", [expenseId, payee]);
    await database.query("INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ($1, $2, 1000)", [expenseId, payer]);
    await database.query(`INSERT INTO content_reports (id, reporter_id, reported_user_id, target_kind, target_id, reason, snapshot)
      VALUES ($1, $2, $3, 'expense', $4, 'other', '{"description":"Private title"}')`, [reportId, payer, author, expenseId]);
    return { author, expenseId, reportId, payer, payee, request: {
      groupId, expenseId, toUserId: payee, amountCents: 1000, currency: "USD", method: "cash",
      note: "", received: false, scopeGroupIds: [], netAcrossScopes: false, operationId: randomUUID(),
    } };
  }

  /**
   * Observes real database contention, without relying on request timing.
   * @param fragment SQL identifying the statement expected to wait.
   * @returns Resolves when the server reports the blocked statement.
   */
  async function waiting(fragment: string): Promise<void> {
    await expect.poll(async () => {
      await database.query("SELECT pg_stat_clear_snapshot()");
      return (await database.query(`SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
        AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query ILIKE $1`, [`%${fragment}%`])).rows.length > 0;
    }, { timeout: 4000, interval: 10 }).toBe(true);
  }



  it("retries safely when a new report arrives before the account row is locked", async () => {
    const bill = await fixture();
    let erasure: Promise<void> | undefined;
    await database.query("BEGIN");
    try {
      await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`account:content:${bill.author}`]);
      erasure = erase(bill.author, "DELETE");
      void erasure.catch(() => undefined);
      await waiting("pg_advisory_xact_lock");
      await database.query(`INSERT INTO content_reports (id, reporter_id, reported_user_id, target_kind, target_id, reason, snapshot)
        SELECT $1, $2, reported_user_id, target_kind, target_id, reason, snapshot FROM content_reports WHERE id = $3`,
        [randomUUID(), bill.payee, bill.reportId]);
    } finally {
      await database.query("COMMIT");
    }
    await expect(erasure).resolves.toBeUndefined();
    expect((await database.query("SELECT id FROM content_reports WHERE target_id = $1", [bill.expenseId])).rows).toEqual([]);
    expect((await database.query("SELECT description FROM expenses WHERE id = $1", [bill.expenseId])).rows)
      .toEqual([{ description: "Deleted expense" }]);
  });

  it("finishes payment and erasure while moderation waits on the report cascade", async () => {
    const bill = await fixture();
    let erasure: Promise<void> | undefined;
    let payment: ReturnType<typeof record> | undefined;
    let moderation: Promise<string> | undefined;
    await database.query("BEGIN");
    try {
      // Row-level report locks still work. Pause only the cascading delete
      // after erasure has taken its account/content locks and rewritten text.
      await database.query("LOCK TABLE content_reports IN SHARE MODE");
      erasure = erase(bill.author, "DELETE");
      void erasure.catch(() => undefined);
      await waiting("DELETE FROM users");
      payment = record(bill.payer, bill.request);
      void payment.catch(() => undefined);
      await waiting("pg_advisory_xact_lock_shared");
      moderation = moderate(bill.reportId).then(() => "removed", (error: { code: string }) => error.code);
      await waiting("FROM content_reports");
    } finally {
      await database.query("COMMIT");
    }
    await expect(erasure).resolves.toBeUndefined();
    await expect(payment).resolves.toMatchObject({ amountCents: 1000 });
    await expect(moderation).resolves.toBe("not_found");
    expect((await database.query("SELECT expense_description FROM settlements WHERE expense_id = $1", [bill.expenseId])).rows)
      .toEqual([{ expense_description: "Deleted expense" }]);
  });

  for (const mode of ["account", "moderation", "operator"] as const) {
    const skipOperator = mode === "operator" && !MODERATION_CONTAINER;
    it.skipIf(skipOperator).each(["removal", "payment"] as const)(
      `${mode} erasure keeps the title removed when %s starts first`,
      async (first) => {
        const bill = await fixture();
        const remove = () => mode === "account" ? erase(bill.author, "DELETE")
          : mode === "operator" ? operatorRemoval(bill.reportId) : moderate(bill.reportId);
        const outcomes: Promise<unknown>[] = [];
        await database.query("BEGIN");
        try {
          await database.query(first === "removal" ? "LOCK TABLE expenses IN SHARE MODE" : "LOCK TABLE settlements IN SHARE MODE");
          const leader = first === "removal" ? remove() : record(bill.payer, bill.request);
          void leader.catch(() => undefined);
          outcomes.push(leader);
          await waiting(first === "removal" ? "UPDATE expenses SET description" : "INSERT INTO settlements");
          const follower = first === "removal" ? record(bill.payer, bill.request) : remove();
          void follower.catch(() => undefined);
          outcomes.push(follower);
          await waiting("pg_advisory_xact_lock");
        } finally {
          await database.query("COMMIT");
        }
        await Promise.all(outcomes);
        const payments = await database.query("SELECT expense_description, amount_cents FROM settlements WHERE expense_id = $1", [bill.expenseId]);
        expect(payments.rows).toEqual([{ expense_description: mode === "account" ? "Deleted expense" : "Content removed", amount_cents: 1000 }]);
      },
    );
  }
});

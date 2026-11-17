/** Real PostgreSQL projection contention, erasure ordering and ICU matching regressions. */

import { randomUUID } from "node:crypto";
import { Client, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { expenseDebts } from "@haalkhata/shared/expense/debts";
import { testDatabaseName } from "../testing/testDatabase";
import { lockAccountForDeletion } from "@/server/auth/repo/deletion/accountDeletion.repo";
import { withLedgerTransaction } from "./ledgerLocks";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_projection_race");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

/** @returns Whether the isolated local PostgreSQL regressions can run. */
async function reachable(): Promise<boolean> {
  const probe = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try { await probe.connect(); return true; }
  catch { return false; }
  finally { await probe.end(); }
}

describe.skipIf(!await reachable())("expense projection concurrency", () => {
  let database: Client;
  let first: Client;
  let erase: typeof import("@/server/auth/usecase/deletion/accountDeletion.usecase").deleteAccount;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    await (await import("../db/db")).ensureMigrated();
    database = new Client({ connectionString: TEST_URL });
    first = new Client({ connectionString: TEST_URL });
    await Promise.all([database.connect(), first.connect()]);
    erase = (await import("@/server/auth/usecase/deletion/accountDeletion.usecase")).deleteAccount;
  }, 60000);

  afterAll(async () => {
    await Promise.all([database?.end(), first?.end()]);
    await (globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } }).__haalkhataPool?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  /** @param expenseId Optional bill id. @returns A separate author's bill with one payer, one debtor and replacement participants. */
  async function fixture(expenseId = randomUUID()) {
    const author = randomUUID(), payer = randomUUID(), debtor = randomUUID();
    const nextPayer = randomUUID(), nextDebtor = randomUUID();
    await database.query(`INSERT INTO users(id,name,email,google_sub,avatar_color)
      SELECT person,'Member',person || '@example.test',person,'#778899' FROM unnest($1::text[]) person`,
    [[author, payer, debtor, nextPayer, nextDebtor]]);
    await database.query(`INSERT INTO expenses(id,created_by,description,amount_cents,currency,expense_date,split_type)
      VALUES($1,$2,'Shared bill',100,'USD','2026-11-09','exact')`, [expenseId, author]);
    await database.query("INSERT INTO expense_payers(expense_id,user_id,amount_cents) VALUES($1,$2,100)", [expenseId, payer]);
    await database.query("INSERT INTO expense_splits(expense_id,user_id,owed_cents) VALUES($1,$2,100)", [expenseId, debtor]);
    return { author, payer, debtor, nextPayer, nextDebtor, expenseId };
  }

  /** @param expenseId Bill to inspect. @returns Its exact directed projection. */
  async function movements(expenseId: string) {
    return (await database.query("SELECT from_user, to_user, amount_cents::int FROM expense_pair_movements WHERE expense_id=$1 ORDER BY from_user,to_user", [expenseId])).rows;
  }

  /** @param fragment Statement expected to wait. @returns Resolves after actual PG lock contention. */
  async function waiting(fragment: string): Promise<void> {
    await expect.poll(async () => {
      await database.query("SELECT pg_stat_clear_snapshot()");
      return (await database.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
        AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query ILIKE $1`, [`%${fragment}%`])).rows.length > 0;
    }, { timeout: 3000, interval: 10 }).toBe(true);
  }

  it("never retains stale debts when different children change concurrently", async () => {
    const bill = await fixture();
    await first.query("BEGIN");
    try {
      await first.query("UPDATE expense_payers SET user_id=$2 WHERE expense_id=$1", [bill.expenseId, bill.nextPayer]);
      await expect(withLedgerTransaction((client) => client.query("UPDATE expense_splits SET user_id=$2 WHERE expense_id=$1", [bill.expenseId, bill.nextDebtor])))
        .rejects.toMatchObject({ code: "unavailable" });
      // The refused statement's child change and projection both roll back.
      expect((await database.query("SELECT user_id FROM expense_splits WHERE expense_id=$1", [bill.expenseId])).rows).toEqual([{ user_id: bill.debtor }]);
    } finally { await first.query("COMMIT"); }
    await withLedgerTransaction((client) => client.query("UPDATE expense_splits SET user_id=$2 WHERE expense_id=$1", [bill.expenseId, bill.nextDebtor]));
    expect(await movements(bill.expenseId)).toEqual([{ from_user: bill.nextDebtor, to_user: bill.nextPayer, amount_cents: 100 }]);
  });

  it("reads the committed child version after a same-row writer waits", async () => {
    const bill = await fixture();
    await first.query("BEGIN");
    let follower: Promise<unknown> | undefined;
    try {
      await first.query("UPDATE expense_payers SET user_id=$2 WHERE expense_id=$1", [bill.expenseId, bill.nextPayer]);
      follower = withLedgerTransaction((client) => client.query("UPDATE expense_payers SET amount_cents=97 WHERE expense_id=$1", [bill.expenseId]));
      void follower.catch(() => undefined);
      await waiting("SET amount_cents=97");
    } finally { await first.query("COMMIT"); }
    await follower;
    expect(await movements(bill.expenseId)).toEqual([{ from_user: bill.debtor, to_user: bill.nextPayer, amount_cents: 97 }]);
  });

  it("refuses child-first contention before it can invert a parent-first edit", async () => {
    const bill = await fixture();
    await first.query("BEGIN");
    try {
      await first.query("UPDATE expenses SET description='Edited' WHERE id=$1", [bill.expenseId]);
      await expect(withLedgerTransaction((client) => client.query("UPDATE expense_splits SET user_id=$2 WHERE expense_id=$1", [bill.expenseId, bill.nextDebtor])))
        .rejects.toMatchObject({ code: "unavailable" });
      await first.query("DELETE FROM expense_splits WHERE expense_id=$1", [bill.expenseId]);
      await first.query("INSERT INTO expense_splits(expense_id,user_id,owed_cents) VALUES($1,$2,100)", [bill.expenseId, bill.nextDebtor]);
    } finally { await first.query("COMMIT"); }
    expect(await movements(bill.expenseId)).toEqual([{ from_user: bill.nextDebtor, to_user: bill.payer, amount_cents: 100 }]);
  });

  it("preflights erasure's bill locks before providers or any destructive changes", async () => {
    const bill = await fixture();
    await first.query("BEGIN");
    try {
      await first.query("UPDATE expenses SET description='Editing' WHERE id=$1", [bill.expenseId]);
      await expect(erase(bill.payer, "DELETE")).rejects.toMatchObject({ code: "unavailable" });
      expect((await database.query("SELECT id FROM users WHERE id=$1", [bill.payer])).rows).toHaveLength(1);
      expect(await movements(bill.expenseId)).toEqual([{ from_user: bill.debtor, to_user: bill.payer, amount_cents: 100 }]);
    } finally { await first.query("COMMIT"); }
    await erase(bill.payer, "DELETE");
    const projected = await movements(bill.expenseId);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ from_user: bill.debtor, amount_cents: 100 });
    expect(projected[0].to_user).not.toBe(bill.payer);
  });

  it("keeps erasure's preflight locks through every child refresh", async () => {
    const bill = await fixture();
    await database.query("BEGIN");
    let erasure: Promise<void> | undefined;
    try {
      await database.query("LOCK TABLE operations IN SHARE MODE");
      erasure = erase(bill.payer, "DELETE");
      void erasure.catch(() => undefined);
      await waiting("DELETE FROM operations");
      await expect(withLedgerTransaction((client) => client.query("UPDATE expense_splits SET user_id=$2 WHERE expense_id=$1", [bill.expenseId, bill.nextDebtor])))
        .rejects.toMatchObject({ code: "unavailable" });
    } finally { await database.query("COMMIT"); }
    await erasure;
    const projected = await movements(bill.expenseId);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ from_user: bill.debtor, amount_cents: 100 });
    expect(projected[0].to_user).not.toBe(bill.payer);
  });

  it("refreshes a bulk statement in sorted bill order, independent of insertion order", async () => {
    const later = await fixture(`bulk-z-${randomUUID()}`);
    const earlier = await fixture(`bulk-a-${randomUUID()}`);
    await first.query("BEGIN");
    try {
      await first.query("CREATE TEMP TABLE refresh_order (position integer GENERATED ALWAYS AS IDENTITY, expense_id text)");
      await first.query(`CREATE FUNCTION pg_temp.record_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO refresh_order(expense_id) VALUES (NEW.expense_id); RETURN NULL; END; $$`);
      await first.query(`CREATE TRIGGER record_refresh AFTER INSERT ON expense_pair_movements
        FOR EACH ROW EXECUTE FUNCTION pg_temp.record_refresh()`);
      await first.query("UPDATE expense_payers SET amount_cents=97 WHERE expense_id=ANY($1::text[])", [[later.expenseId, earlier.expenseId]]);
      expect((await first.query("SELECT expense_id FROM refresh_order ORDER BY position")).rows)
        .toEqual([{ expense_id: earlier.expenseId }, { expense_id: later.expenseId }]);
    } finally { await first.query("ROLLBACK"); }
  });

  it("preflights and erases a thousand affected bills without consuming advisory locks per bill", async () => {
    const bill = await fixture();
    const prefix = randomUUID();
    await database.query(`INSERT INTO expenses(id,created_by,description,amount_cents,currency,expense_date,split_type)
      SELECT $1 || '-' || number,$2,'History',1,'USD','2026-11-09','exact' FROM generate_series(1,1000) number`, [prefix, bill.author]);
    await database.query(`INSERT INTO expense_payers(expense_id,user_id,amount_cents)
      SELECT id,$2,1 FROM expenses WHERE id LIKE $1`, [`${prefix}-%`, bill.payer]);
    await database.query(`INSERT INTO expense_splits(expense_id,user_id,owed_cents)
      SELECT id,$2,1 FROM expenses WHERE id LIKE $1`, [`${prefix}-%`, bill.debtor]);
    const started = performance.now();
    await erase(bill.payer, "DELETE");
    expect(performance.now() - started).toBeLessThan(10000);
    expect((await database.query(`SELECT count(*)::int AS count, sum(amount_cents)::int AS cents
      FROM expense_pair_movements WHERE expense_id LIKE $1 AND from_user=$2 AND to_user<>$3`,
    [`${prefix}-%`, bill.debtor, bill.payer])).rows).toEqual([{ count: 1000, cents: 1000 }]);
  });

  it("uses indexed erasure preflight with twenty thousand unrelated bills", async () => {
    const bill = await fixture();
    const prefix = randomUUID();
    await database.query(`INSERT INTO expenses(id,created_by,description,amount_cents,currency,expense_date,split_type)
      SELECT $1 || '-' || number,$2,'Unrelated',1,'USD','2026-11-09','exact' FROM generate_series(1,20000) number`, [prefix, bill.author]);
    await database.query("ANALYZE expenses, expense_payers, expense_splits, expense_items, expense_item_assignments, live_splits");
    await first.query("BEGIN");
    const statements = vi.spyOn(first, "query");
    try {
      await lockAccountForDeletion(bill.payer, first as unknown as PoolClient);
      const statement = statements.mock.calls.map((call) => call[0] as unknown)
        .find((query) => typeof query === "string" && query.includes("FOR NO KEY UPDATE NOWAIT"));
      expect(statement).toBeTypeOf("string");
      statements.mockRestore();
      const result = await first.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`, [bill.payer]);
      const plan = result.rows[0]["QUERY PLAN"][0].Plan;
      expect(plan["Actual Rows"]).toBe(1);
      expect(plan["Shared Hit Blocks"] + plan["Shared Read Blocks"]).toBeLessThan(100);
    } finally {
      statements.mockRestore();
      await first.query("ROLLBACK");
    }
  });

  it("matches shared en-US allocation for UUIDs and deterministic collation ties", async () => {
    const people = ["aaaaaaaa-1111-4111-8111-111111111111", "abaaaaaa-1111-4111-8111-111111111111", "é", "e\u0301"];
    const expenseId = randomUUID();
    await database.query(`INSERT INTO users(id,name,email,google_sub,avatar_color)
      SELECT person,'Member',person || '@example.test',person,'#778899' FROM unnest($1::text[]) person`, [people]);
    await database.query(`INSERT INTO expenses(id,created_by,description,amount_cents,currency,expense_date,split_type)
      VALUES($1,$2,'Collation',2,'USD','2026-11-09','exact')`, [expenseId, people[0]]);
    await database.query("INSERT INTO expense_payers(expense_id,user_id,amount_cents) VALUES($1,$2,1),($1,$3,1)", [expenseId, people[2], people[3]]);
    await database.query("INSERT INTO expense_splits(expense_id,user_id,owed_cents) VALUES($1,$2,1),($1,$3,1)", [expenseId, people[0], people[1]]);
    const expected = expenseDebts(people.slice(2).map((userId) => ({ userId, amountCents: 1 })), people.slice(0, 2).map((userId) => ({ userId, amountCents: 1 })));
    expect(await movements(expenseId)).toEqual(expected.map((entry) => ({ from_user: entry.from, to_user: entry.to, amount_cents: entry.amountCents })));
  });
});

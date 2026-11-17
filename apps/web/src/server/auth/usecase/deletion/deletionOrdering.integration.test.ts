/** Real PostgreSQL erasure rolls back before providers on database failures, and rolls back locally on provider failure. */

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";
import { revokeAppleToken } from "../apple/apple.provider";

vi.mock("../apple/apple.provider", () => ({ revokeAppleToken: vi.fn() }));
const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_deletion_order_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const PEOPLE = ["order-a", "order-b", "order-c", "order-d"];

/** @returns Whether the isolated integration database can be created. */
async function databaseReachable(): Promise<boolean> {
  const probe = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try { await probe.connect(); return true; }
  catch { return false; }
  finally { await probe.end(); }
}

const reachable = await databaseReachable();
describe.skipIf(!reachable)("database erasure before external revocation", () => {
  let database: Client;
  let deleteAccount: typeof import("./accountDeletion.usecase").deleteAccount;
  let sequence = 0;

  /**
   * Seeds two authored bills and a distinct writer's bill sharing both revision keys.
   * @returns The account, group and bill identities for this case.
   */
  async function seed() {
    const prefix = `delete-order-${++sequence}`;
    const account = `${prefix}-account`, group = `${prefix}-group`;
    await database.query("INSERT INTO users(id,name,email,google_sub,avatar_color) VALUES ($1,'Erasing person',$1||'@order.example',$1,'#778899')", [account]);
    await database.query("INSERT INTO apple_credentials(user_id,client_id,refresh_token_ciphertext) VALUES ($1,'order-client','fixture-ciphertext')", [account]);
    await database.query("INSERT INTO groups(id,name,created_by) VALUES ($1,'Shared trip',$2)", [group, PEOPLE[0]]);
    await database.query("INSERT INTO group_members(group_id,user_id) SELECT $1,person FROM unnest($2::text[]) person", [group, [...PEOPLE, account]]);
    const first = `${prefix}-first`, second = `${prefix}-second`, writer = `${prefix}-writer`;
    await database.query(`INSERT INTO expenses(id,group_id,created_by,description,amount_cents,currency,expense_date,split_type)
      VALUES ($1,$4,$5,'First authored',100,'USD','2026-11-09','exact'),
             ($2,$4,$5,'Second authored',100,'USD','2026-11-09','exact'),
             ($3,$4,$6,'Other authored',200,'USD','2026-11-09','exact')`, [first, second, writer, group, account, PEOPLE[0]]);
    await database.query(`INSERT INTO expense_payers(expense_id,user_id,amount_cents)
      VALUES ($1,$5,100),($2,$4,100),($3,$4,100),($3,$5,100)`, [first, second, writer, PEOPLE[1], PEOPLE[3]]);
    await database.query(`INSERT INTO expense_splits(expense_id,user_id,owed_cents)
      VALUES ($1,$5,100),($2,$4,100),($3,$4,100),($3,$5,100)`, [first, second, writer, PEOPLE[0], PEOPLE[2]]);
    return { account, group, first, second, writer };
  }

  /** @returns A complete comparison of personal rows and derivative ledger state. */
  async function state() {
    const result = await database.query(`SELECT jsonb_build_object(
      'users',(SELECT jsonb_agg(to_jsonb(person) ORDER BY id) FROM users person),
      'credentials',(SELECT jsonb_agg(to_jsonb(credential) ORDER BY user_id,client_id) FROM apple_credentials credential),
      'expenses',(SELECT jsonb_agg(to_jsonb(expense) ORDER BY id) FROM expenses expense),
      'payers',(SELECT jsonb_agg(to_jsonb(payer) ORDER BY expense_id,user_id) FROM expense_payers payer),
      'splits',(SELECT jsonb_agg(to_jsonb(split) ORDER BY expense_id,user_id) FROM expense_splits split),
      'movements',(SELECT jsonb_agg(to_jsonb(movement) ORDER BY expense_id,from_user,to_user) FROM expense_pair_movements movement),
      'revisions',(SELECT jsonb_agg(to_jsonb(revision) ORDER BY scope_key,low_user,high_user) FROM ledger_pair_revisions revision)
    ) AS state`);
    return result.rows[0].state;
  }

  /**
   * Waits for one known transaction at the deterministic fixture barrier.
   * @param processId Backend to observe, or null for the deletion's advisory barrier.
   * @param locktype Expected lock class.
   * @returns Once the lock wait is visible.
   */
  async function waitForLock(processId: number | null, locktype: string): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const waiting = await database.query(`SELECT 1 FROM pg_locks WHERE NOT granted AND locktype=$2
        AND ($1::int IS NULL OR pid=$1) AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`, [processId, locktype]);
      if (waiting.rows.length) return;
      // Transaction-id locks are cluster-scoped and have no database column.
      if (processId && locktype === "transactionid" && (await database.query("SELECT 1 FROM pg_locks WHERE NOT granted AND pid=$1 AND locktype=$2", [processId, locktype])).rows.length) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("expected erasure/writer lock barrier");
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect(); await admin.query(`CREATE DATABASE ${TEST_DATABASE}`); await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    await (await import("@/server/common/db/db")).ensureMigrated();
    deleteAccount = (await import("./accountDeletion.usecase")).deleteAccount;
    database = new Client({ connectionString: TEST_URL }); await database.connect();
    await database.query("INSERT INTO users(id,name,email,google_sub,avatar_color) SELECT person,person,person||'@order.example',person,'#778899' FROM unnest($1::text[]) person", [PEOPLE]);
  }, 60_000);
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(revokeAppleToken).mockResolvedValue(undefined); });
  afterAll(async () => {
    await database?.end();
    const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
    await cache.__haalkhataPool?.end();
    const admin = new Client({ connectionString: ADMIN_URL }); await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`); await admin.end();
  });

  it("rolls every local change back when the provider fails after integrity checks", async () => {
    const fixture = await seed(), before = await state();
    const statements = vi.spyOn(Client.prototype, "query");
    try {
      vi.mocked(revokeAppleToken).mockImplementation(async () => {
        expect(statements.mock.calls.at(-1)?.[0]).toBe("SET CONSTRAINTS ALL IMMEDIATE");
        throw new Error("provider unavailable");
      });
      await expect(deleteAccount(fixture.account, "DELETE")).rejects.toThrow("provider unavailable");
    } finally { statements.mockRestore(); }
    expect(await state()).toEqual(before);
    expect(revokeAppleToken).toHaveBeenCalledWith("order-client", "fixture-ciphertext");
  });

  it("runs only COMMIT on the erasure connection after revoking captured credentials", async () => {
    const fixture = await seed();
    const statements = vi.spyOn(Client.prototype, "query");
    let providerIndex = 0, connection: unknown;
    try {
      vi.mocked(revokeAppleToken).mockImplementation(async () => {
        expect(statements.mock.calls.at(-1)?.[0]).toBe("SET CONSTRAINTS ALL IMMEDIATE");
        providerIndex = statements.mock.calls.length;
        connection = statements.mock.contexts.at(-1);
      });
      await deleteAccount(fixture.account, "DELETE");
      const afterProvider = statements.mock.calls.slice(providerIndex).flatMap((call, index) =>
        statements.mock.contexts[providerIndex + index] === connection ? [call[0]] : []);
      expect(afterProvider).toEqual(["COMMIT"]);
    } finally { statements.mockRestore(); }
    expect((await database.query("SELECT 1 FROM users WHERE id=$1", [fixture.account])).rows).toHaveLength(0);
  });

  it("rejects a deferred integrity failure before calling the provider", async () => {
    const fixture = await seed(), before = await state();
    await database.query("CREATE TABLE deletion_failure_target(expense_id text PRIMARY KEY)");
    await database.query("INSERT INTO deletion_failure_target VALUES ($1)", [fixture.first]);
    await database.query(`CREATE FUNCTION reject_deferred_deletion_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.description='Deleted expense' AND EXISTS(SELECT 1 FROM deletion_failure_target WHERE expense_id=NEW.id)
      THEN RAISE EXCEPTION 'fixture deferred check' USING ERRCODE='23514'; END IF; RETURN NULL; END $$;
      CREATE CONSTRAINT TRIGGER reject_deferred_deletion_fixture AFTER UPDATE ON expenses
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_deferred_deletion_fixture()`);
    try {
      await expect(deleteAccount(fixture.account, "DELETE")).rejects.toMatchObject({ code: "23514" });
      expect(revokeAppleToken).not.toHaveBeenCalled();
      expect(await state()).toEqual(before);
    } finally {
      await database.query("DROP TRIGGER reject_deferred_deletion_fixture ON expenses; DROP FUNCTION reject_deferred_deletion_fixture(); DROP TABLE deletion_failure_target");
    }
  });

  it("rolls a distinct-parent revision deadlock back before any provider call", async () => {
    const fixture = await seed();
    const writer = new Client({ connectionString: TEST_URL }); await writer.connect();
    const writerProcess = (await writer.query("SELECT pg_backend_pid() AS process_id")).rows[0].process_id;
    await database.query("CREATE TABLE deletion_pause_target(expense_id text PRIMARY KEY)");
    await database.query("INSERT INTO deletion_pause_target VALUES ($1)", [fixture.first]);
    await database.query(`CREATE FUNCTION pause_deletion_after_first_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.description='Deleted expense' AND EXISTS(SELECT 1 FROM deletion_pause_target WHERE expense_id=NEW.id)
      THEN PERFORM pg_advisory_xact_lock(hashtextextended('deletion-order-pause',0)); END IF; RETURN NULL; END $$;
      CREATE TRIGGER zz_pause_deletion_after_first_revision AFTER UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION pause_deletion_after_first_revision()`);
    await database.query("BEGIN");
    await database.query("SELECT pg_advisory_xact_lock(hashtextextended('deletion-order-pause',0))");
    const erasing = deleteAccount(fixture.account, "DELETE").then(() => ({ ok: true }), (error: unknown) => ({ error }));
    let editing: Promise<unknown> | undefined;
    try {
      await waitForLock(null, "advisory");
      await writer.query("BEGIN"); await writer.query("SET LOCAL deadlock_timeout='10s'");
      await writer.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`ledger:group:${fixture.group}`]);
      editing = writer.query("UPDATE expenses SET description='Independent concurrent edit' WHERE id=$1", [fixture.writer]);
      await waitForLock(writerProcess, "transactionid");
      await database.query("COMMIT");
      expect(await erasing).toMatchObject({ error: { code: "unavailable" } });
      await editing;
      expect(revokeAppleToken).not.toHaveBeenCalled();
      expect((await database.query("SELECT description FROM expenses WHERE id=$1", [fixture.first])).rows[0].description).toBe("First authored");
      expect((await database.query("SELECT 1 FROM users WHERE id=$1", [fixture.account])).rows).toHaveLength(1);
    } finally {
      await database.query("ROLLBACK"); await writer.query("ROLLBACK");
      await Promise.allSettled([erasing, editing]); await writer.end();
      await database.query("DROP TRIGGER zz_pause_deletion_after_first_revision ON expenses; DROP FUNCTION pause_deletion_after_first_revision(); DROP TABLE deletion_pause_target");
    }
  });
});

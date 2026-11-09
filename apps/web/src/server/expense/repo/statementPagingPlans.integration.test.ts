/** Real PostgreSQL plans keep one-line statement pages bounded, including timestamp ties and both directions. */

import { Client, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";
import type { LedgerLineKey } from "@/server/expense/domain/ledgerOrder";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_statement_plans_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const PEOPLE = ["statement-first", "statement-second"];
const MOMENT = "2026-11-09T12:00:00.000000Z";
const { reads } = vi.hoisted(() => ({ reads: [] as { sql: string; values?: readonly unknown[] }[] }));
vi.mock("@/server/common/db/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/common/db/db")>();
  return { ...actual, query: async (...args: Parameters<typeof actual.query>) => {
    reads.push({ sql: args[0], values: args[1] });
    return actual.query(...args);
  } };
});

/** @returns Whether the isolated integration database can be created. */
async function databaseReachable(): Promise<boolean> {
  const probe = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try { await probe.connect(); return true; }
  catch { return false; }
  finally { await probe.end(); }
}

/** Execution-plan counters, including tuples discarded before a LIMIT. */
interface PlanNode {
  "Actual Rows": number;
  "Actual Loops": number;
  "Rows Removed by Filter"?: number;
  "Rows Removed by Index Recheck"?: number;
  "Shared Hit Blocks": number;
  "Shared Read Blocks": number;
  Plans?: PlanNode[];
}

/**
 * Counts tuples processed, including filtered rows an output-row budget misses.
 * @param plan - An analyzed execution-plan node.
 * @returns Work across the complete plan tree.
 */
function visitedRows(plan: PlanNode): number {
  return (plan["Actual Rows"] + (plan["Rows Removed by Filter"] ?? 0) + (plan["Rows Removed by Index Recheck"] ?? 0)) * plan["Actual Loops"]
    + (plan.Plans ?? []).reduce((total, child) => total + visitedRows(child), 0);
}

const reachable = await databaseReachable();
describe.skipIf(!reachable)("bounded statement page plans", () => {
  let database: Client;
  let movements: typeof import("./movements.repo");
  let settlements: typeof import("./settlements.repo");

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    await (await import("@/server/common/db/db")).ensureMigrated();
    movements = await import("./movements.repo");
    settlements = await import("./settlements.repo");
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query("INSERT INTO users(id,name,email,google_sub,avatar_color) SELECT person,person,person||'@plans.example',person,'#778899' FROM unnest($1::text[]) person", [PEOPLE]);
    await database.query(`INSERT INTO expenses(id,created_by,description,amount_cents,currency,expense_date,split_type,created_at)
      SELECT 'plan-bill-'||lpad(ordinal::text,5,'0'),$1,'Statement fixture',100,'USD','2026-11-09','exact',$2 FROM generate_series(1,1200) ordinal`, [PEOPLE[0], MOMENT]);
    await database.query("INSERT INTO expense_payers(expense_id,user_id,amount_cents) SELECT id,CASE WHEN right(id,1)::int%2=0 THEN $1 ELSE $2 END,100 FROM expenses", PEOPLE);
    await database.query("INSERT INTO expense_splits(expense_id,user_id,owed_cents) SELECT id,CASE WHEN right(id,1)::int%2=0 THEN $2 ELSE $1 END,100 FROM expenses", PEOPLE);
    await database.query(`INSERT INTO settlements(id,from_user,to_user,amount_cents,currency,method,recorded_by,created_at)
      SELECT 'plan-pay-'||lpad(ordinal::text,5,'0'),CASE WHEN ordinal%2=0 THEN $1 ELSE $2 END,
        CASE WHEN ordinal%2=0 THEN $2 ELSE $1 END,1,'USD','bank',$1,$3 FROM generate_series(1,1200) ordinal`, [...PEOPLE, MOMENT]);
    for (const table of ["expenses", "expense_pair_movements", "settlements"]) await database.query(`ANALYZE ${table}`);
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
    await cache.__haalkhataPool?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it.each(["expense", "payment"])("seeks both directions for the first and deep tied %s page", async (kind) => {
    const readPage = kind === "expense" ? movements.listPairMovementPage : settlements.listSettlementsBetweenPage;
    const before: LedgerLineKey = { day: "2026-11-09", at: MOMENT, rank: kind === "expense" ? 0 : 2,
      id: kind === "expense" ? "plan-bill-00010" : "plan-pay-00010" };
    for (const cursor of [null, before]) {
      reads.length = 0;
      const page = await readPage(PEOPLE[0], PEOPLE[1], cursor, 1, database as unknown as PoolClient);
      expect(page).toHaveLength(1);
      expect(page[0].id).toBe(kind === "expense"
        ? cursor ? "plan-bill-00009" : "plan-bill-01200"
        : cursor ? "plan-pay-00009" : "plan-pay-01200");
      const request = reads.at(-1)!;
      const analyzed = await database.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${request.sql}`, [...(request.values ?? [])]);
      const plan: PlanNode = analyzed.rows[0]["QUERY PLAN"][0].Plan;
      expect(visitedRows(plan)).toBeLessThan(64);
      expect(plan["Shared Hit Blocks"] + plan["Shared Read Blocks"]).toBeLessThan(100);
    }
  });

  it("preserves a bill-date cursor when its creation moment belongs to another UTC day", async () => {
    for (const [lineDay, moment, expected] of [
      ["0000-01-01", MOMENT, 0],
      ["2026-11-08", MOMENT, 0], ["2026-11-10", MOMENT, 1],
      ["2026-11-09", "2026-11-08T12:00:00.000000Z", 0],
      ["2026-11-09", "2026-11-10T12:00:00.000000Z", 1],
    ] as const) {
      const page = await settlements.listSettlementsBetweenPage(PEOPLE[0], PEOPLE[1],
        { day: lineDay, at: moment, rank: 0, id: "bill-cursor" }, 1, database as unknown as PoolClient);
      expect(page).toHaveLength(expected);
    }
  });
});

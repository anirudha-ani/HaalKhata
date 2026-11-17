/** Actual indexed comment plans stay bounded across long blocked and sparse-visible threads. */

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";
import { listCommentPage } from "./comments.repo";

const observed = vi.hoisted(() => ({ sql: "", values: undefined as readonly unknown[] | undefined }));
vi.mock("@/server/common/db/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/common/db/db")>();
  return { ...actual, query: async (...args: Parameters<typeof actual.query>) => {
    if (args[0].includes("WITH RECURSIVE recent")) { observed.sql = args[0]; observed.values = args[1]; }
    return actual.query(...args);
  } };
});

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_comment_plans");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

/** PostgreSQL plan fields used by the traversal budget. */
interface PlanNode {
  "Node Type": string;
  "Actual Rows": number;
  "Actual Loops": number;
  "Rows Removed by Filter"?: number;
  "Rows Removed by Index Recheck"?: number;
  "Rows Removed by Join Filter"?: number;
  Plans?: PlanNode[];
}

/** @returns Whether the isolated local database is available. */
async function reachable(): Promise<boolean> {
  const probe = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try { await probe.connect(); return true; }
  catch { return false; }
  finally { await probe.end(); }
}

/** @param plan Root or child plan. @returns Every node, retaining actual loop counts. */
function nodes(plan: PlanNode): PlanNode[] {
  return [plan, ...(plan.Plans ?? []).flatMap(nodes)];
}

describe.skipIf(!await reachable())("indexed blocked-comment pages", () => {
  let database: Client;
  let usecase: typeof import("../usecase/expense.usecase");

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect(); await admin.query(`CREATE DATABASE ${TEST_DATABASE}`); await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    await (await import("@/server/common/db/db")).ensureMigrated();
    database = new Client({ connectionString: TEST_URL }); await database.connect();
    usecase = await import("../usecase/expense.usecase");
    await database.query(`INSERT INTO users(id,name,email,google_sub,avatar_color)
      SELECT person,person,person || '@example.test',person,'#778899'
      FROM unnest(ARRAY['viewer','blocked','current','former']) person`);
    await database.query("INSERT INTO groups(id,name,created_by) VALUES('group','Private','current')");
    await database.query(`INSERT INTO group_members(group_id,user_id,role)
      VALUES('group','current','owner'),('group','viewer','member'),('group','blocked','member'),('group','former','member')`);
    await database.query(`INSERT INTO expenses(id,group_id,created_by,description,amount_cents,currency,expense_date,split_type)
      VALUES('bill','group','current','Bill',1,'USD','2026-11-09','exact')`);
    await database.query(`INSERT INTO comments(id,expense_id,user_id,body,created_at)
      SELECT 'comment-' || lpad(number::text,8,'0'),'bill','blocked','Message','2026-11-09T00:00:00Z'
      FROM generate_series(1,20000) number`);
    await database.query("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES('viewer','blocked')");
    await database.query("DELETE FROM group_members WHERE user_id='former'");
    await database.query("ANALYZE comments,user_blocks");
  }, 60000);

  afterAll(async () => {
    await database?.end();
    await (globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } }).__haalkhataPool?.end();
    const admin = new Client({ connectionString: ADMIN_URL }); await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`); await admin.end();
  });

  /** @returns The production query's actual plan, using its captured parameters. */
  async function plan() {
    const result = await database.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${observed.sql}`, [...(observed.values ?? [])]);
    return result.rows[0]["QUERY PLAN"][0].Plan as PlanNode;
  }

  it("skips twenty thousand blocked comments using author seeks", async () => {
    expect(await listCommentPage("bill", "viewer", null, 31)).toEqual([]);
    const measured = nodes(await plan());
    expect(measured.reduce((total, node) => total + (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0)
      + (node["Rows Removed by Index Recheck"] ?? 0) + (node["Rows Removed by Join Filter"] ?? 0)) * node["Actual Loops"], 0)).toBeLessThan(2000);
    expect(measured.some((node) => node["Node Type"] === "Recursive Union" && node["Actual Rows"] === 1)).toBe(true);
  });

  it("retains sparse former-author comments and exact tied cursors with reverse-direction blocks", async () => {
    await database.query("UPDATE comments SET user_id='former' WHERE id=ANY($1::text[])",
      [["comment-00000001", "comment-00003000", "comment-00012000", "comment-00019000"]]);
    await database.query("UPDATE comments SET user_id='current' WHERE id='comment-00008000'");
    await database.query("DELETE FROM user_blocks");
    await database.query("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES('blocked','viewer')");
    await database.query("ANALYZE comments,user_blocks");
    const pages: string[][] = [];
    let cursor = "";
    do {
      const response = await usecase.listComments("viewer", "bill", { cursor, limit: 2 });
      expect(response.comments.length).toBeGreaterThan(0);
      expect(response.comments.length).toBeLessThanOrEqual(2);
      pages.unshift(response.comments.map((comment) => comment.id));
      cursor = response.nextCursor;
    } while (cursor);
    expect(pages.flat()).toEqual(["comment-00000001", "comment-00003000", "comment-00008000", "comment-00012000", "comment-00019000"]);
    expect((await database.query("SELECT 1 FROM group_members WHERE user_id='former'")).rows).toEqual([]);
  });

  it("uses only the bounded recent window for ordinary mostly visible pages", async () => {
    await database.query("UPDATE comments SET user_id='current' WHERE substring(id from 9)::int % 10 <> 0");
    await database.query("ANALYZE comments");
    expect(await listCommentPage("bill", "viewer", null, 31)).toHaveLength(31);
    const measured = nodes(await plan());
    expect(measured.reduce((total, node) => total + (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0)
      + (node["Rows Removed by Index Recheck"] ?? 0) + (node["Rows Removed by Join Filter"] ?? 0)) * node["Actual Loops"], 0)).toBeLessThan(2000);
    expect(measured.filter((node) => node["Node Type"] === "Recursive Union").map((node) => node["Actual Rows"])).toEqual([0]);
  });
});

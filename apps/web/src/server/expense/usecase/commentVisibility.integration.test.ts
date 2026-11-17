/** Comments share the permission snapshot, including membership changes between statements. */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const control = vi.hoisted(() => ({ beforeRead: undefined as (() => Promise<void>) | undefined }));
vi.mock("@/server/expense/repo/comments.repo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/expense/repo/comments.repo")>();
  return { ...actual, listCommentPage: async (...args: Parameters<typeof actual.listCommentPage>) => {
    await control.beforeRead?.();
    return actual.listCommentPage(...args);
  } };
});

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_comment_visibility");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

/** @returns Whether the isolated local database is reachable. */
async function reachable(): Promise<boolean> {
  const probe = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try { await probe.connect(); return true; }
  catch { return false; }
  finally { await probe.end(); }
}

describe.skipIf(!await reachable())("comment permission snapshots", () => {
  let database: Client;
  let usecase: typeof import("./expense.usecase");

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect(); await admin.query(`CREATE DATABASE ${TEST_DATABASE}`); await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    await (await import("@/server/common/db/db")).ensureMigrated();
    database = new Client({ connectionString: TEST_URL }); await database.connect();
    usecase = await import("./expense.usecase");
  }, 60000);

  afterAll(async () => {
    await database?.end();
    await (globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } }).__haalkhataPool?.end();
    const admin = new Client({ connectionString: ADMIN_URL }); await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`); await admin.end();
  });

  /** @param scope Visibility through membership or a zero share. @returns A bill with an existing comment. */
  async function fixture(scope: string) {
    const owner = randomUUID(), viewer = randomUUID(), groupId = randomUUID(), expenseId = randomUUID();
    await database.query(`INSERT INTO users(id,name,email,google_sub,avatar_color)
      SELECT person,'Member',person || '@example.test',person,'#778899' FROM unnest($1::text[]) person`, [[owner, viewer]]);
    await database.query("INSERT INTO groups(id,name,created_by) VALUES($1,'Private',$2)", [groupId, owner]);
    await database.query("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'member')", [groupId, owner, viewer]);
    await database.query(`INSERT INTO expenses(id,group_id,created_by,description,amount_cents,currency,expense_date,split_type)
      VALUES($1,$2,$3,'Bill',100,'USD','2026-11-09','exact')`, [expenseId, scope === "group" ? groupId : null, owner]);
    await database.query("INSERT INTO expense_payers(expense_id,user_id,amount_cents) VALUES($1,$2,100)", [expenseId, owner]);
    await database.query("INSERT INTO expense_splits(expense_id,user_id,owed_cents) VALUES($1,$2,100)", [expenseId, owner]);
    if (scope === "one-off") await database.query("INSERT INTO expense_splits(expense_id,user_id,owed_cents) VALUES($1,$2,0)", [expenseId, viewer]);
    await database.query("INSERT INTO comments(id,expense_id,user_id,body) VALUES($1,$2,$3,'Before removal')", [randomUUID(), expenseId, owner]);
    return { owner, viewer, groupId, expenseId };
  }

  it.each([["detail", "group"], ["page", "group"], ["detail", "one-off"], ["page", "one-off"]] as const)(
    "does not reveal a post-removal comment through the %s read on a %s bill", async (kind, scope) => {
    const bill = await fixture(scope);
    let release!: () => void;
    let arrived!: () => void;
    const paused = new Promise<void>((resolve) => { arrived = resolve; });
    const resume = new Promise<void>((resolve) => { release = resolve; });
    control.beforeRead = async () => { arrived(); await resume; };
    const reading = kind === "detail" ? usecase.getExpense(bill.viewer, bill.expenseId)
      : usecase.listComments(bill.viewer, bill.expenseId, { cursor: "", limit: 30 });
    void reading.catch(() => undefined);
    try {
      await paused;
      if (scope === "group") await database.query("DELETE FROM group_members WHERE group_id=$1 AND user_id=$2", [bill.groupId, bill.viewer]);
      else await database.query("DELETE FROM expense_splits WHERE expense_id=$1 AND user_id=$2", [bill.expenseId, bill.viewer]);
      await database.query("INSERT INTO comments(id,expense_id,user_id,body) VALUES($1,$2,$3,'After removal: private')", [randomUUID(), bill.expenseId, bill.owner]);
    } finally { control.beforeRead = undefined; release(); }
    const response = await reading;
    expect(response.comments.map((comment) => comment.body)).toEqual(["Before removal"]);
    await expect(usecase.listComments(bill.viewer, bill.expenseId, { cursor: "", limit: 30 }))
      .rejects.toMatchObject({ code: "permission_denied" });
  });
});

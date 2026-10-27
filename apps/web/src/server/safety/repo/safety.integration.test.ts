/** Real Postgres safety: blocks suppress communication, reports require access, money stays exact. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_safety_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const MODERATION_CONTAINER = process.env.MODERATION_TEST_CONTAINER;

/** @returns Whether the explicitly selected test database is reachable. */
async function databaseReachable() {
  const database = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try { await database.connect(); await database.end(); return true; } catch { return false; }
}

/**
 * Runs the actual deployed SQL against the disposable container, including psql control flow.
 * @param action Operator action.
 * @param reportId Report under review.
 */
function moderate(action: string, reportId: string): void {
  execFileSync("docker", ["exec", "-i", MODERATION_CONTAINER!, "psql", "-U", "haalkhata", "-d", TEST_DATABASE,
    "-v", `action=${action}`, "-v", `report_id=${reportId}`], { input: readFileSync(new URL("./moderation.sql", import.meta.url)), stdio: ["pipe", "pipe", "pipe"] });
}

describe.skipIf(!await databaseReachable())("safety against Postgres", () => {
  let database: Client;
  let safety: typeof import("../usecase/safety.usecase");
  let reportId: string;
  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL }); await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`); await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    await (await import("@/server/common/db/db")).ensureMigrated();
    database = new Client({ connectionString: TEST_URL }); await database.connect();
    await database.query(`INSERT INTO users (id, name, email, avatar_color, google_sub) VALUES
      ('viewer', 'Viewer', 'viewer@example.com', '#c73e2e', 'viewer-sub'), ('author', 'Author', 'author@example.com', '#c73e2e', 'author-sub'),
      ('outsider', 'Outsider', 'outsider@example.com', '#c73e2e', 'outsider-sub')`);
    await database.query("INSERT INTO friendships (user_id, friend_id) VALUES ('viewer', 'author'), ('author', 'viewer')");
    await database.query(`INSERT INTO expenses (id, description, amount_cents, currency, expense_date, split_type, created_by)
      VALUES ('shared', 'Dinner', 1000, 'USD', '2026-10-01', 'equal', 'author')`);
    await database.query("INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ('shared', 'author', 1000)");
    await database.query("INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ('shared', 'viewer', 500), ('shared', 'author', 500)");
    await database.query("INSERT INTO comments (id, expense_id, user_id, body) VALUES ('reported-comment', 'shared', 'author', 'Unwanted contact')");
    await database.query("INSERT INTO friend_requests (requester_id, recipient_id) VALUES ('author', 'viewer')");
    await database.query(`INSERT INTO activity (id, actor_id, type, message, audience, link) VALUES
      ('author-event', 'author', 'comment', 'Unwanted contact', '["viewer","author"]', '/expenses/shared'),
      ('viewer-event', 'viewer', 'comment', 'Visible event', '["viewer"]', '/expenses/shared')`);
    safety = await import("../usecase/safety.usecase");
  }, 60_000);
  afterAll(async () => {
    await database?.end();
    const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } }; await cache.__haalkhataPool?.end();
    const admin = new Client({ connectionString: ADMIN_URL }); await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`); await admin.end();
  });
  it("refuses reports by nonparticipants and deduplicates authorized reports", async () => {
    const report = { targetKind: "comment", targetId: "reported-comment", reason: "harassment" };
    await expect(safety.reportContent("outsider", report)).rejects.toMatchObject({ code: "permission_denied" });
    await safety.reportContent("viewer", report); await safety.reportContent("viewer", report);
    const reports = (await database.query("SELECT * FROM content_reports")).rows;
    expect(reports).toHaveLength(1); expect(reports[0].snapshot.body).toBe("Unwanted contact"); reportId = reports[0].id;
  });
  it("blocks an unpaid counterparty and filters messages before page limits", async () => {
    await safety.blockUser("viewer", "author");
    expect((await database.query("SELECT * FROM friend_requests")).rows).toEqual([]);
    const comments = await (await import("@/server/expense/repo/comments.repo")).listCommentsByExpense("shared", "viewer");
    expect(comments).toEqual([]);
    const activity = await (await import("@/server/social/repo/activity.repo")).listActivityPage({ userId: "viewer" }, { limit: 1, cursor: "", month: "" });
    expect(activity.rows.map((entry) => entry.id)).toEqual(["viewer-event"]); expect(activity.nextCursor).toBe("");
    await (await import("@/server/social/repo/notifications.repo")).insertNotifications(["viewer"], { actorId: "author", type: "comment", title: "Unwanted", body: "Blocked", link: "/expenses/shared" });
    expect((await database.query("SELECT * FROM notifications")).rows).toEqual([]);
    expect((await database.query("SELECT amount_cents, currency FROM expenses WHERE id = 'shared'")).rows).toEqual([{ amount_cents: 1000, currency: "USD" }]);
    expect((await database.query("SELECT SUM(owed_cents)::int AS cents FROM expense_splits")).rows[0].cents).toBe(1000);
  });
  it("prevents direct reminders and new requests in either direction", async () => {
    const social = await import("@/server/social/usecase/social.usecase");
    await expect(social.sendReminder("author", "viewer")).rejects.toMatchObject({ code: "permission_denied" });
    expect(await social.addFriend("author", { userId: "viewer", email: "", phone: "" })).toEqual({});
    expect((await database.query("SELECT * FROM friend_requests")).rows).toEqual([]);
  });
  it("unblocks only the caller's own preference and restores comment visibility", async () => {
    await safety.unblockUser("viewer", "author");
    expect((await (await import("@/server/expense/repo/comments.repo")).listCommentsByExpense("shared", "viewer"))).toHaveLength(1);
  });
  it.skipIf(!MODERATION_CONTAINER)("executes moderator removal and suspension without altering the ledger", async () => {
    moderate("list", ""); moderate("remove", reportId);
    expect((await database.query("SELECT * FROM comments")).rows).toEqual([]);
    expect((await database.query("SELECT status FROM content_reports WHERE id = $1", [reportId])).rows[0].status).toBe("removed");
    moderate("suspend", reportId);
    const users = await import("@/server/auth/repo/users.repo");
    expect(await users.findUserTokenVersion("author")).toBeUndefined();
    const authentication = await import("@/server/auth/usecase/account/auth.usecase");
    const session = await import("@/server/auth/usecase/session/session");
    expect(await authentication.sessionUser(session.createToken("author", 1))).toBeNull();
    moderate("resume", reportId); expect(await users.findUserTokenVersion("author")).toBe(2);
    expect((await database.query("SELECT SUM(owed_cents)::int AS cents FROM expense_splits")).rows[0].cents).toBe(1000);
  });
});

/**
 * Integration test for the moderation queue and its actions, against a real
 * Postgres.
 *
 * Three things here cannot be shown with mocks: that reports about the same
 * content become one entry with the right counts, that the queue carries the
 * reported words and the author's name and nothing else about anyone, and
 * that each action changes exactly what it says (and never money).
 *
 * The tests run in order on one seeded database, each building on what the
 * previous ones did, the way an operator would work down the queue.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import {
  AUTHOR,
  COMMENT_ID,
  EXPENSE_ID,
  GROUP_ID,
  OWN_COMMENT_ID,
  PRIVATE_VALUES,
  REPORTED_WORDS,
  REPORTS,
  SPAM_COMMENT_ID,
  seedModeration,
} from "./moderationFixtures";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_moderation_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

/**
 * Checks whether the admin database accepts a connection.
 *
 * @returns True when the suite can run.
 */
async function databaseReachable(): Promise<boolean> {
  const client = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

describe.skipIf(!(await databaseReachable()))("moderation against Postgres", () => {
  let database: Client;
  let moderation: typeof import("./moderation.usecase");

  /** @returns Every report's status, by id. */
  async function statuses(): Promise<Record<string, string>> {
    const { rows } = await database.query<{ id: string; status: string }>(
      "SELECT id, status FROM content_reports",
    );
    return Object.fromEntries(rows.map((resultRow) => [resultRow.id, resultRow.status]));
  }

  /** @returns The ledger's total of what everyone owes, which no action may move. */
  async function owedTotal(): Promise<number> {
    const { rows } = await database.query<{ total: number }>(
      "SELECT SUM(owed_cents)::int AS total FROM expense_splits",
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
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await seedModeration(database);
    moderation = await import("./moderation.usecase");
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

  it("lists each piece of reported content once, longest waiting first", async () => {
    const queue = await moderation.listReports();

    expect(queue.reportsTruncated).toBe(false);
    expect(queue.suspended).toEqual([]);
    expect(queue.reports.map((entry) => [entry.targetKind, entry.text])).toEqual([
      ["comment", REPORTED_WORDS.comment],
      ["expense", REPORTED_WORDS.description],
      ["group", REPORTED_WORDS.groupName],
      ["user", REPORTED_WORDS.profileName],
      ["comment", "Buy cheap followers now"],
      ["user", "Merged Away"],
    ]);
    // Two people reported the same comment: one entry, both reasons, and
    // the newest report as the handle.
    expect(queue.reports[0]).toMatchObject({
      reportId: REPORTS.commentSecond,
      reportCount: 2,
      reasons: [
        { reason: "harassment", count: 1 },
        { reason: "hate", count: 1 },
      ],
      notes: "",
      itemNames: [],
      author: { name: "Author Person", suspended: false, active: true, openReportCount: 4 },
    });
    expect(Date.parse(queue.reports[0].firstReportedAt)).toBeLessThan(
      Date.parse(queue.reports[0].lastReportedAt),
    );
    expect(queue.reports[1]).toMatchObject({
      reportId: REPORTS.expense,
      notes: REPORTED_WORDS.notes,
      itemNames: [REPORTED_WORDS.item],
    });
  });

  it("withholds an author's name that is an email address, and marks a merged author", async () => {
    const queue = await moderation.listReports();
    const spam = queue.reports.find((entry) => entry.reportId === REPORTS.spamComment);
    const merged = queue.reports.find((entry) => entry.reportId === REPORTS.merged);

    expect(spam?.author).toMatchObject({ name: "", active: true, openReportCount: 1 });
    expect(merged?.author).toMatchObject({ active: false });
  });

  it("carries the reported words and nothing else a person would call private", async () => {
    const queue = JSON.stringify(await moderation.listReports());

    for (const privateValue of PRIVATE_VALUES) {
      expect(queue).not.toContain(privateValue);
    }
    // A closed report is history, not work: it is never listed.
    expect(queue).not.toContain(REPORTS.oldClosed);
    expect(queue).not.toContain("Old Name");
  });

  it("refuses something that is not a report, and a report that does not exist", async () => {
    await expect(moderation.dismissReport("cmt-reported-0001")).rejects.toMatchObject({
      code: "invalid_argument",
    });
    await expect(
      moderation.dismissReport("99999999-9999-4999-8999-999999999999"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("dismisses: closes the reports and leaves the content alone, once", async () => {
    await moderation.dismissReport(REPORTS.spamComment);

    expect((await statuses())[REPORTS.spamComment]).toBe("dismissed");
    const { rows } = await database.query("SELECT body FROM comments WHERE id = $1", [SPAM_COMMENT_ID]);
    expect(rows).toEqual([{ body: "Buy cheap followers now" }]);
    await expect(moderation.dismissReport(REPORTS.spamComment)).rejects.toMatchObject({
      code: "failed_precondition",
    });
  });

  it("removes a comment through either report about it, and closes both", async () => {
    const owedBefore = await owedTotal();

    await moderation.removeReportedContent(REPORTS.commentFirst);

    const reportStatuses = await statuses();
    expect(reportStatuses[REPORTS.commentFirst]).toBe("removed");
    expect(reportStatuses[REPORTS.commentSecond]).toBe("removed");
    const comments = await database.query("SELECT id FROM comments ORDER BY id");
    expect(comments.rows.map((resultRow) => resultRow.id)).toEqual([OWN_COMMENT_ID, SPAM_COMMENT_ID].sort());
    expect(comments.rows.map((resultRow) => resultRow.id)).not.toContain(COMMENT_ID);
    // The feed line and the notification that quoted it now say it is gone;
    // the reporter's own lines are untouched.
    const activity = await database.query("SELECT id, message FROM activity ORDER BY id");
    expect(activity.rows).toEqual([
      { id: "act-author-1", message: "Content removed after moderation" },
      { id: "act-reporter-1", message: "Reporter wrote elsewhere" },
    ]);
    const notifications = await database.query("SELECT id, title, body FROM notifications ORDER BY id");
    expect(notifications.rows).toEqual([
      { id: "ntf-author-1", title: "Content removed after moderation", body: "" },
      { id: "ntf-other-1", title: "Reporter commented", body: "Ordinary words" },
    ]);
    expect(await owedTotal()).toBe(owedBefore);
  });

  it("removes an expense's words and keeps its money", async () => {
    await moderation.removeReportedContent(REPORTS.expense);

    const expense = await database.query(
      "SELECT description, notes, amount_cents FROM expenses WHERE id = $1",
      [EXPENSE_ID],
    );
    expect(expense.rows).toEqual([{ description: "Content removed", notes: "", amount_cents: 98765 }]);
    const items = await database.query("SELECT name, total_cents FROM expense_items WHERE expense_id = $1", [
      EXPENSE_ID,
    ]);
    expect(items.rows).toEqual([{ name: "Item", total_cents: 98765 }]);
    expect(await owedTotal()).toBe(98765);
  });

  it("renames a group and resets a profile, sign-in and contact details untouched", async () => {
    await moderation.removeReportedContent(REPORTS.group);
    await moderation.removeReportedContent(REPORTS.profile);

    const group = await database.query("SELECT name FROM groups WHERE id = $1", [GROUP_ID]);
    expect(group.rows).toEqual([{ name: "Shared group" }]);
    const author = await database.query(
      "SELECT name, avatar_url, email, google_sub FROM users WHERE id = $1",
      [AUTHOR],
    );
    expect(author.rows).toEqual([
      { name: "Member", avatar_url: null, email: "author.private@example.com", google_sub: "google-sub-author" },
    ]);
    const handles = await database.query("SELECT handle FROM payment_handles WHERE user_id = $1", [AUTHOR]);
    expect(handles.rows).toEqual([]);
    // Everything about the author has been handled; only the merged account's report waits.
    const queue = await moderation.listReports();
    expect(queue.reports.map((entry) => entry.reportId)).toEqual([REPORTS.merged]);
  });

  it("suspends through a closed report, ends every session, and does it once", async () => {
    const session = await import("@/server/auth/usecase/session/session");
    const authentication = await import("@/server/auth/usecase/account/auth.usecase");
    const tokenVersion = async () =>
      (await database.query("SELECT token_version FROM users WHERE id = $1", [AUTHOR])).rows[0]
        .token_version as number;
    const before = await tokenVersion();
    const liveToken = session.createToken(AUTHOR, before);
    expect(await authentication.sessionUser(liveToken)).not.toBeNull();

    await moderation.suspendAuthor(REPORTS.profile);
    await moderation.suspendAuthor(REPORTS.profile);

    expect(await tokenVersion()).toBe(before + 1);
    expect(await authentication.sessionUser(liveToken)).toBeNull();
    expect(await authentication.sessionUser(session.createToken(AUTHOR, before + 1))).toBeNull();
    const queue = await moderation.listReports();
    expect(queue.suspended).toEqual([
      { name: "Member", suspendedAt: expect.any(String), reportId: REPORTS.profile },
    ]);
  });

  it("resumes, and the sessions the suspension ended stay ended", async () => {
    const session = await import("@/server/auth/usecase/session/session");
    const authentication = await import("@/server/auth/usecase/account/auth.usecase");
    const suspendedVersion = (
      await database.query("SELECT token_version FROM users WHERE id = $1", [AUTHOR])
    ).rows[0].token_version as number;

    await moderation.resumeAuthor(REPORTS.profile);
    await moderation.resumeAuthor(REPORTS.profile);

    const { rows } = await database.query(
      "SELECT suspended_at, token_version FROM users WHERE id = $1",
      [AUTHOR],
    );
    expect(rows).toEqual([{ suspended_at: null, token_version: suspendedVersion + 1 }]);
    expect(await authentication.sessionUser(session.createToken(AUTHOR, suspendedVersion))).toBeNull();
    expect(await authentication.sessionUser(session.createToken(AUTHOR, suspendedVersion + 1))).not.toBeNull();
    expect((await moderation.listReports()).suspended).toEqual([]);
  });

  it("will not pretend to suspend an account that was merged away", async () => {
    await expect(moderation.suspendAuthor(REPORTS.merged)).rejects.toMatchObject({
      code: "failed_precondition",
    });
    const { rows } = await database.query("SELECT suspended_at FROM users WHERE merged_into IS NOT NULL");
    expect(rows).toEqual([{ suspended_at: null }]);
  });
});

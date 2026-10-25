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
  MERGED,
  OWN_COMMENT_ID,
  PRIVATE_VALUES,
  REPORTED_WORDS,
  REPORTER,
  REPORTS,
  SPAM_COMMENT_ID,
  seedModeration,
} from "./moderationFixtures";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_moderation_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
/** The stand-in a deleted account leaves behind, added by one test. */
const DELETED_STAND_IN = "user-deleted-f6a7";

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

  /** @returns Every feed line's id, mapped to its message. */
  async function feedLines(): Promise<Record<string, string>> {
    const { rows } = await database.query<{ id: string; message: string }>(
      "SELECT id, message FROM activity",
    );
    return Object.fromEntries(rows.map((resultRow) => [resultRow.id, resultRow.message]));
  }

  /** @returns Every notification's id, mapped to its title. */
  async function notificationTitles(): Promise<Record<string, string>> {
    const { rows } = await database.query<{ id: string; title: string }>(
      "SELECT id, title FROM notifications",
    );
    return Object.fromEntries(rows.map((resultRow) => [resultRow.id, resultRow.title]));
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
    // The feed line and the notification that quoted it now say it is gone.
    // The author's lines about anything else, a comment on another expense
    // included, and everyone else's lines are untouched.
    expect(await feedLines()).toEqual({
      "act-author-1": "Content removed after moderation",
      "act-reporter-1": "Reporter wrote elsewhere",
      "act-author-2": "Author Person commented elsewhere",
      "act-author-3": 'Author Person added "Taxi"',
      "act-expense-1": 'Reporter Person updated "Offensive expense description" in "Offensive group name"',
      "act-group-1": 'Reporter Person added "Groceries" in "Offensive group name"',
      "act-group-comment-1": 'Reporter Person commented on "Groceries": see you there',
      "act-names-author-1": "Reporter Person paid Author Person $20.00",
      "act-names-author-2": 'Reporter Person added Author Person and Second Reporter to "Weekend"',
      "act-namesake-1": "Second Reporter paid Author Person $5.00",
    });
    const notifications = await database.query("SELECT id, title, body FROM notifications ORDER BY id");
    expect(notifications.rows).toEqual([
      { id: "ntf-author-1", title: "Content removed after moderation", body: "" },
      { id: "ntf-author-2", title: "Author Person paid you", body: "Settlement" },
      { id: "ntf-group-1", title: "Reporter Person added you", body: "Offensive group name" },
      { id: "ntf-group-comment-1", title: 'Reporter Person commented on "Groceries"', body: "see you there" },
      { id: "ntf-group-expense-1", title: 'Reporter Person added "Groceries"', body: "Offensive group name · you owe Reporter Person $6.17" },
      { id: "ntf-names-author-1", title: 'Reporter Person added Author Person to "Weekend"', body: "" },
      { id: "ntf-names-author-2", title: 'Second Reporter added "Taxi"', body: "One-off expense · you owe Author Person $3.00" },
      { id: "ntf-namesake-1", title: "Second Reporter recorded a payment", body: "Paid to Author Person" },
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
    // Lines linking to the expense are replaced, whoever wrote them; the
    // author's lines about other expenses are not.
    expect(await feedLines()).toMatchObject({
      "act-expense-1": "Content removed after moderation",
      "act-author-2": "Author Person commented elsewhere",
      "act-author-3": 'Author Person added "Taxi"',
      "act-group-1": 'Reporter Person added "Groceries" in "Offensive group name"',
    });
  });

  it("renames a group and replaces what names it, and nothing else", async () => {
    await moderation.removeReportedContent(REPORTS.group);

    // Every line in the group's feed names the group except a comment's.
    expect(await feedLines()).toMatchObject({
      "act-group-1": "Content removed after moderation",
      "act-group-comment-1": 'Reporter Person commented on "Groceries": see you there',
      "act-author-2": "Author Person commented elsewhere",
      "act-author-3": 'Author Person added "Taxi"',
      "act-reporter-1": "Reporter wrote elsewhere",
    });
    // An expense notification's body opens with the group's name; a comment
    // notification on the same expense does not name the group.
    expect(await notificationTitles()).toMatchObject({
      "ntf-group-1": "Content removed after moderation",
      "ntf-group-expense-1": "Content removed after moderation",
      "ntf-group-comment-1": 'Reporter Person commented on "Groceries"',
      "ntf-author-2": "Author Person paid you",
    });
  });

  it("resets a profile and every line about what they did, sign-in and contact details untouched", async () => {
    await moderation.removeReportedContent(REPORTS.profile);

    expect(await feedLines()).toMatchObject({
      "act-author-2": "Content removed after moderation",
      "act-author-3": "Content removed after moderation",
      "act-reporter-1": "Reporter wrote elsewhere",
      // Someone else's action that names them: a payment to them, being added.
      "act-names-author-1": "Content removed after moderation",
      "act-names-author-2": "Content removed after moderation",
      // In their audience but not naming them.
      "act-group-comment-1": 'Reporter Person commented on "Groceries": see you there',
      // The same words about somebody else, in a feed they cannot see.
      "act-namesake-1": "Second Reporter paid Author Person $5.00",
    });
    expect(await notificationTitles()).toMatchObject({
      "ntf-author-2": "Content removed after moderation",
      "ntf-other-1": "Reporter commented",
      // Told to a third member, and the body of an expense they paid for.
      "ntf-names-author-1": "Content removed after moderation",
      "ntf-names-author-2": "Content removed after moderation",
      "ntf-namesake-1": "Second Reporter recorded a payment",
    });

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

  it("leaves a suspended account that was merged away or deleted off the suspended list", async () => {
    await moderation.suspendAuthor(REPORTS.profile);
    try {
      // Nothing clears suspended_at when an account is merged or deleted:
      // the tombstone, and the stand-in a deletion leaves, stay suspended
      // and stand for nobody.
      await database.query("UPDATE users SET suspended_at = now() WHERE id = $1", [MERGED]);
      await database.query(
        `INSERT INTO users (id, name, avatar_color, deleted_at, suspended_at)
         VALUES ($1, 'Deleted member', '#857a68', now(), now())`,
        [DELETED_STAND_IN],
      );

      expect((await moderation.listReports()).suspended).toEqual([
        { name: "Member", suspendedAt: expect.any(String), reportId: REPORTS.profile },
      ]);
    } finally {
      await database.query("UPDATE users SET suspended_at = NULL WHERE id = $1", [MERGED]);
      await database.query("DELETE FROM users WHERE id = $1", [DELETED_STAND_IN]);
      await moderation.resumeAuthor(REPORTS.profile);
    }
  });

  it("will not pretend to suspend an account that was merged away", async () => {
    const merged = (await moderation.listReports()).reports.find(
      (entry) => entry.reportId === REPORTS.merged,
    );
    expect(merged?.author).toMatchObject({ active: false, deleted: false });
    await expect(moderation.suspendAuthor(REPORTS.merged)).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringContaining("merged into another"),
    });
    const { rows } = await database.query("SELECT suspended_at FROM users WHERE merged_into IS NOT NULL");
    expect(rows).toEqual([{ suspended_at: null }]);
  });

  it("says when the author deleted their account, rather than merged it", async () => {
    // A deleted person's reports go with their account; what is left to
    // report is content now belonging to the anonymous stand-in.
    const standInReport = "99999999-9999-4999-8999-999999999999";
    await database.query(
      `INSERT INTO users (id, name, avatar_color, deleted_at) VALUES ($1, 'Deleted member', '#857a68', now())`,
      [DELETED_STAND_IN],
    );
    await database.query(
      `INSERT INTO content_reports (id, reporter_id, reported_user_id, target_kind, target_id, reason, snapshot, status)
       VALUES ($1, $2, $3, 'expense', 'exp-stand-in-0003', 'spam', jsonb_build_object('description', 'Left behind'), 'open')`,
      [standInReport, REPORTER, DELETED_STAND_IN],
    );
    try {
      const entry = (await moderation.listReports()).reports.find(
        (candidate) => candidate.reportId === standInReport,
      );
      expect(entry?.author).toMatchObject({ active: false, deleted: true });
      await expect(moderation.suspendAuthor(standInReport)).rejects.toMatchObject({
        code: "failed_precondition",
        message: expect.stringContaining("deleted their account"),
      });
      const { rows } = await database.query("SELECT suspended_at FROM users WHERE id = $1", [
        DELETED_STAND_IN,
      ]);
      expect(rows).toEqual([{ suspended_at: null }]);
    } finally {
      await database.query("DELETE FROM content_reports WHERE id = $1", [standInReport]);
      await database.query("DELETE FROM users WHERE id = $1", [DELETED_STAND_IN]);
    }
  });
});

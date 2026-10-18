/**
 * Integration test for push notifications against a real Postgres: the outbox
 * is written on the ledger transaction, the claim is race-free, signing out
 * stops pushes, switches and blocks hold, and the new group-wide kinds reach
 * exactly the right people. Only the delivery service is faked.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { formatMoney } from "@haalkhata/shared/money/money";
import type { PushMessage, PushProvider } from "@/server/push/usecase/provider/pushTypes";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_push_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const ANI_ID = "user-ani";
const BOBA_ID = "user-boba";
const CHAD_ID = "user-chad";
const GROUP = "grp-goa";
const BOBA_TOKEN = "ExponentPushToken[bobabobabobabobabobabo]";

/**
 * Checks whether the admin database accepts a connection.
 *
 * @returns True when the suite can run.
 */
async function databaseReachable(): Promise<boolean> {
  const client = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * A delivery service that accepts everything and remembers what it was sent.
 *
 * @returns The provider and the messages it received.
 */
function recordingProvider(): PushProvider & { sent: PushMessage[] } {
  const sent: PushMessage[] = [];
  let ticketNumber = 0;
  return {
    name: "recording",
    sent,
    async send(messages) {
      sent.push(...messages);
      return messages.map(() => ({ status: "ok" as const, id: `ticket-${(ticketNumber += 1)}` }));
    },
    async receipts() {
      return {};
    },
  };
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("push notifications against Postgres", () => {
  let database: Client;
  let closePool: () => Promise<void>;
  let createExpense: typeof import("@/server/expense/usecase/expense.usecase").createExpense;
  let setSimplifyDebts: typeof import("@/server/group/usecase/group.usecase").setSimplifyDebts;
  let transferOwnership: typeof import("@/server/group/usecase/group.usecase").transferOwnership;
  let registerDevice: typeof import("@/server/push/usecase/devices/devices.usecase").registerDevice;
  let updatePreferences: typeof import("@/server/push/usecase/preferences/preferences.usecase").updatePreferences;
  let drainPushOutbox: typeof import("@/server/push/usecase/dispatch/dispatch.usecase").drainPushOutbox;
  let claimDuePushes: typeof import("@/server/push/repo/pushOutbox.repo").claimDuePushes;
  let insertNotifications: typeof import("@/server/social/repo/notifications.repo").insertNotifications;
  let transaction: typeof import("@/server/common/db/db").transaction;
  let logOut: typeof import("@/server/auth/usecase/account/auth.usecase").logOut;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    process.env.DATABASE_URL = TEST_URL;
    const dbModule = await import("@/server/common/db/db");
    await dbModule.ensureMigrated();
    transaction = dbModule.transaction;
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({ createExpense } = await import("@/server/expense/usecase/expense.usecase"));
    ({ setSimplifyDebts, transferOwnership } = await import("@/server/group/usecase/group.usecase"));
    ({ registerDevice } = await import("@/server/push/usecase/devices/devices.usecase"));
    ({ updatePreferences } = await import("@/server/push/usecase/preferences/preferences.usecase"));
    ({ drainPushOutbox } = await import("@/server/push/usecase/dispatch/dispatch.usecase"));
    ({ claimDuePushes } = await import("@/server/push/repo/pushOutbox.repo"));
    ({ insertNotifications } = await import("@/server/social/repo/notifications.repo"));
    ({ logOut } = await import("@/server/auth/usecase/account/auth.usecase"));

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub) VALUES
         ($1, 'ani@example.com', 'Ani', '#c73e2e', now(), 'google-ani'),
         ($2, 'boba@example.com', 'Boba', '#0f8a5f', now(), 'google-boba'),
         ($3, 'chad@example.com', 'Chad', '#2e5bc7', now(), 'google-chad')`,
      [ANI_ID, BOBA_ID, CHAD_ID],
    );
    await database.query(`INSERT INTO groups (id, name, created_by) VALUES ($1, 'Goa trip', $2)`, [GROUP, ANI_ID]);
    await database.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`,
      [GROUP, ANI_ID, BOBA_ID, CHAD_ID],
    );
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  beforeEach(async () => {
    await database.query(`DELETE FROM push_outbox`);
    await database.query(`DELETE FROM push_tickets`);
    await database.query(`DELETE FROM push_devices`);
    await database.query(`DELETE FROM push_preferences`);
    await database.query(`DELETE FROM notifications`);
    await database.query(`DELETE FROM user_blocks`);
  });

  /**
   * Adds a one-off dinner Ani paid and Boba owes half of, in the group.
   *
   * @returns The stored expense.
   */
  async function aniAddsDinner() {
    return createExpense(ANI_ID, {
      groupId: GROUP,
      description: "Dinner",
      amountCents: 2400,
      currency: "USD",
      category: "food",
      expenseDate: "2026-10-16",
      splitType: "exact",
      notes: "",
      payers: [{ userId: ANI_ID, amountCents: 2400 }],
      splitSpecs: [
        { userId: ANI_ID, amountCents: 1200, percentBp: 0, shares: 0 },
        { userId: BOBA_ID, amountCents: 1200, percentBp: 0, shares: 0 },
      ],
      items: [],
      taxCents: 0,
      tipCents: 0,
    } as never);
  }

  /** Registers Boba's phone under Boba's current session version. */
  async function bobaRegistersPhone() {
    const { rows } = await database.query(`SELECT token_version FROM users WHERE id = $1`, [BOBA_ID]);
    return registerDevice(BOBA_ID, rows[0].token_version, {
      expoPushToken: BOBA_TOKEN,
      installationId: "install-boba-phone",
      platform: "ios",
      label: "iPhone 17",
      appVersion: "1.1.0",
    });
  }

  it("queues a push for each bell row on the expense's own transaction", async () => {
    const expense = await aniAddsDinner();
    const queued = await database.query(
      `SELECT outbox.user_id, note.type, note.link FROM push_outbox outbox
         JOIN notifications note ON note.id = outbox.notification_id`,
    );
    expect(queued.rows).toEqual([{ user_id: BOBA_ID, type: "expense_added", link: `/expenses/${expense.id}` }]);
  });

  it("queues nothing when the change rolls back", async () => {
    await expect(
      transaction(async (client) => {
        await insertNotifications([BOBA_ID], { actorId: ANI_ID, type: "reminder", title: "t", body: "", link: "/friends" }, client);
        throw new Error("the ledger write failed");
      }),
    ).rejects.toThrow("the ledger write failed");
    expect((await database.query(`SELECT 1 FROM notifications`)).rowCount).toBe(0);
    expect((await database.query(`SELECT 1 FROM push_outbox`)).rowCount).toBe(0);
  });

  it("queues nothing across a block, and still queues for everyone else", async () => {
    await database.query(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [BOBA_ID, ANI_ID]);
    await insertNotifications(
      [BOBA_ID, CHAD_ID],
      { actorId: ANI_ID, type: "member_added", title: 'Ani added Dee to "Goa trip"', body: "", link: `/groups/${GROUP}` },
    );
    expect((await database.query(`SELECT user_id FROM push_outbox`)).rows).toEqual([{ user_id: CHAD_ID }]);
  });

  it("delivers to the phone with the unread badge, records the ticket and empties the outbox", async () => {
    const device = await bobaRegistersPhone();
    const expense = await aniAddsDinner();
    const provider = recordingProvider();
    const report = await drainPushOutbox(provider);
    expect(report).toMatchObject({ claimed: 1, sent: 1 });
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({
      to: BOBA_TOKEN,
      title: 'Ani added "Dinner"',
      badge: 1,
      threadId: `group-${GROUP}`,
      data: { link: `/expenses/${expense.id}`, recipientId: BOBA_ID },
    });
    expect(provider.sent[0].body).toBe(`Goa trip · you owe Ani ${formatMoney(1200, "USD")}`);
    expect((await database.query(`SELECT 1 FROM push_outbox`)).rowCount).toBe(0);
    expect((await database.query(`SELECT device_id FROM push_tickets`)).rows).toEqual([{ device_id: device.id }]);
    const stamped = await database.query(`SELECT last_sent_at FROM push_devices WHERE id = $1`, [device.id]);
    expect(stamped.rows[0].last_sent_at).not.toBeNull();
  });

  it("never lets two workers claim the same row, and reclaims a lapsed lease", async () => {
    await aniAddsDinner();
    await setSimplifyDebts(ANI_ID, { groupId: GROUP, simplify: true });
    const [first, second] = await Promise.all([claimDuePushes(100, 120, 10), claimDuePushes(100, 120, 10)]);
    const firstIds = first.map((claimed) => claimed.notification_id);
    const secondIds = second.map((claimed) => claimed.notification_id);
    expect(firstIds.length + secondIds.length).toBe(3);
    expect(firstIds.filter((identifier) => secondIds.includes(identifier))).toEqual([]);
    expect(await claimDuePushes(100, 120, 10)).toEqual([]);
    await database.query(`UPDATE push_outbox SET next_attempt_at = now() - interval '1 second'`);
    const reclaimed = await claimDuePushes(100, 120, 10);
    expect(reclaimed).toHaveLength(3);
    expect(reclaimed.every((claimed) => claimed.attempts === 2)).toBe(true);
    await setSimplifyDebts(ANI_ID, { groupId: GROUP, simplify: false });
  });

  it("stops pushing to a phone once its owner signs out everywhere", async () => {
    const device = await bobaRegistersPhone();
    await logOut(BOBA_ID);
    await aniAddsDinner();
    const provider = recordingProvider();
    const report = await drainPushOutbox(provider);
    expect(provider.sent).toEqual([]);
    expect(report.skipped).toBe(1);
    expect((await database.query(`SELECT 1 FROM push_devices WHERE id = $1`, [device.id])).rowCount).toBe(0);
  });

  it("registers nothing for a session signed out between its authentication and the write", async () => {
    const { rows } = await database.query(`SELECT token_version FROM users WHERE id = $1`, [CHAD_ID]);
    const sessionVersion = rows[0].token_version;
    await database.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [CHAD_ID]);
    await expect(
      registerDevice(CHAD_ID, sessionVersion, {
        expoPushToken: "ExponentPushToken[chadchadchadchadchadch]",
        installationId: "install-chad-phone",
        platform: "ios",
        label: "iPhone 16",
        appVersion: "1.1.0",
      }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    const stored = await database.query(`SELECT id FROM push_devices WHERE installation_id = 'install-chad-phone'`);
    expect(stored.rows).toEqual([]);
  });

  it("holds a switch that is off, and still keeps the bell row", async () => {
    await bobaRegistersPhone();
    await updatePreferences(BOBA_ID, { expenses: false, comments: true, payments: true, groups: true, friends: true });
    await aniAddsDinner();
    const provider = recordingProvider();
    await drainPushOutbox(provider);
    expect(provider.sent).toEqual([]);
    expect((await database.query(`SELECT 1 FROM notifications WHERE user_id = $1`, [BOBA_ID])).rowCount).toBe(1);
  });

  it("tells everyone but the actor when debt simplification changes", async () => {
    await setSimplifyDebts(ANI_ID, { groupId: GROUP, simplify: true });
    const told = await database.query(
      `SELECT user_id, title FROM notifications WHERE type = 'simplify_debts' ORDER BY user_id`,
    );
    expect(told.rows).toEqual([
      { user_id: BOBA_ID, title: 'Ani turned on debt simplification in "Goa trip"' },
      { user_id: CHAD_ID, title: 'Ani turned on debt simplification in "Goa trip"' },
    ]);
    await setSimplifyDebts(ANI_ID, { groupId: GROUP, simplify: false });
  });

  it("tells the new owner and, separately, the rest of the group", async () => {
    await transferOwnership(ANI_ID, { groupId: GROUP, userId: BOBA_ID });
    const told = await database.query(
      `SELECT user_id, title FROM notifications WHERE type = 'ownership_transferred' ORDER BY user_id`,
    );
    expect(told.rows).toEqual([
      { user_id: BOBA_ID, title: 'Ani made you the owner of "Goa trip"' },
      { user_id: CHAD_ID, title: 'Ani made Boba the owner of "Goa trip"' },
    ]);
    await transferOwnership(BOBA_ID, { groupId: GROUP, userId: ANI_ID });
  });
});

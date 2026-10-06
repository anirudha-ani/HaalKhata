/**
 * Integration test for settling a pair on their net across scopes, against a
 * real Postgres.
 *
 * The planner's unit tests prove the arithmetic. What they cannot prove is
 * what the feature promises about money: that one recording leaves every
 * balance the pair can see reading what the dialog showed; that the cash and
 * the cancelling entries commit together or not at all; that they can only
 * ever be removed together; that the database itself refuses a set that does
 * not cancel out or is only partly removed, whatever code asks; and that a
 * ledger which moved after the dialog opened is refused, not settled
 * differently than agreed; and that a balance is never read half from before
 * a settlement and half from after it. Those take the real queries, the real
 * trigger, real rows, and real concurrent connections.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_net_settlement_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const PAYER = "user-ani";
const OWED = "user-sam";
const INVITED = "user-invited";
const KEEPER = "user-keeper";

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
 * Inserts one expense paid in full by one person and owed in full by the
 * other, so the debt it creates is exactly its amount.
 *
 * @param database - Connected client on the test database.
 * @param expense - The expense: id, scope, amount, currency, who paid and who owes.
 */
async function insertDebt(
  database: Client,
  expense: {
    id: string;
    groupId: string | null;
    amountCents: number;
    currency: string;
    paidBy: string;
    owedBy: string;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ($1, $2, $1, $3, $4, '2026-10-01', 'exact', $5)`,
    [expense.id, expense.groupId, expense.amountCents, expense.currency, expense.paidBy],
  );
  await database.query(
    `INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ($1, $2, $3)`,
    [expense.id, expense.paidBy, expense.amountCents],
  );
  await database.query(
    `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ($1, $2, $3)`,
    [expense.id, expense.owedBy, expense.amountCents],
  );
}

/**
 * Inserts a group with two members, the first as owner.
 *
 * @param database - Connected client on the test database.
 * @param groupId - Id, also used as the name.
 * @param currency - The group's currency.
 * @param ownerId - The owner.
 * @param memberId - The other member.
 */
async function insertGroup(
  database: Client,
  groupId: string,
  currency: string,
  ownerId: string,
  memberId: string,
): Promise<void> {
  await database.query(
    `INSERT INTO groups (id, name, currency, created_by) VALUES ($1, $1, $2, $3)`,
    [groupId, currency, ownerId],
  );
  await database.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
    [groupId, ownerId, memberId],
  );
}

/**
 * Seeds the reported shape: the payer owes 223.77 outside groups while being
 * owed 195.51 and 15.57 inside two dollar groups, and 75.99 in a euro group
 * that nothing here may touch.
 *
 * @param database - Connected client on the test database.
 */
async function seed(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
     VALUES ($1, 'ani@example.com', 'Ani', '#c73e2e', now(), 'google-ani'),
            ($2, 'sam@example.com', 'Sam', '#0f8a5f', now(), 'google-sam'),
            ($3, 'kit@example.com', 'Kit', '#1c4fa0', now(), 'google-kit')`,
    [PAYER, OWED, KEEPER],
  );
  // Invited, never signed in: the kind of row an account merge absorbs.
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color) VALUES ($1, 'ivy@example.com', 'Ivy', '#6741d9')`,
    [INVITED],
  );
  await insertGroup(database, "grp-catskills", "USD", PAYER, OWED);
  await insertGroup(database, "grp-reunion", "USD", PAYER, OWED);
  await insertGroup(database, "grp-lisbon", "EUR", PAYER, OWED);
  await insertDebt(database, { id: "exp-train", groupId: null, amountCents: 22377, currency: "USD", paidBy: OWED, owedBy: PAYER });
  await insertDebt(database, { id: "exp-cabin", groupId: "grp-catskills", amountCents: 19551, currency: "USD", paidBy: PAYER, owedBy: OWED });
  await insertDebt(database, { id: "exp-dinner", groupId: "grp-reunion", amountCents: 1557, currency: "USD", paidBy: PAYER, owedBy: OWED });
  await insertDebt(database, { id: "exp-tapas", groupId: "grp-lisbon", amountCents: 7599, currency: "EUR", paidBy: PAYER, owedBy: OWED });
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("net settlement against Postgres", () => {
  let database: Client;
  let recordSettlement: typeof import("./expense.usecase").recordSettlement;
  let deleteSettlement: typeof import("./expense.usecase").deleteSettlement;
  let listExpenses: typeof import("./expense.usecase").listExpenses;
  let getExpense: typeof import("./expense.usecase").getExpense;
  let owedByScope: typeof import("./balance.usecase").owedByScope;
  let netWithUser: typeof import("./balance.usecase").netWithUser;
  let userNetInGroup: typeof import("./balance.usecase").userNetInGroup;
  let getFriendLedger: typeof import("./balance.usecase").getFriendLedger;
  let mergeAccounts: typeof import("@/server/auth/repo/accountMerge.repo").mergeAccounts;
  let snapshot: typeof import("@/server/common/db").snapshot;
  let closePool: () => Promise<void>;

  /**
   * What the first person owes the second and the reverse, scope by scope.
   *
   * @param firstId - One of the pair.
   * @param secondId - The other.
   * @returns The two directions as sorted "scope currency cents" strings.
   */
  const scopesBetween = async (firstId: string, secondId: string) => {
    const describeScopes = (list: { groupId: string | null; currency: string; owedCents: number }[]) =>
      list.map((scope) => `${scope.groupId ?? "direct"} ${scope.currency} ${scope.owedCents}`).sort();
    return {
      firstOwes: describeScopes(await owedByScope(firstId, secondId)),
      secondOwes: describeScopes(await owedByScope(secondId, firstId)),
    };
  };

  /**
   * The digest of the position a settle dialog would be showing right now.
   *
   * @param viewerId - Who is looking.
   * @param friendId - The other person.
   * @param currency - The currency being settled.
   * @returns The position's digest, or "" when nothing is outstanding in it.
   */
  const digestShown = async (viewerId: string, friendId: string, currency = "USD") =>
    (await getFriendLedger(viewerId, friendId)).settlePositions.find(
      (position) => position.currency === currency,
    )?.digest ?? "";

  /**
   * A net settlement request from the payer's side, carrying the digest of
   * the position currently on screen unless one is given.
   *
   * @param amountCents - The cash moving.
   * @param extra - Fields to override.
   * @returns The request.
   */
  const netRequest = async (amountCents: number, extra: Record<string, unknown> = {}) => ({
    groupId: "",
    toUserId: OWED,
    amountCents,
    currency: "USD",
    method: "venmo",
    note: "",
    netAcrossScopes: true,
    positionDigest: await digestShown(PAYER, OWED),
    ...extra,
  });

  /**
   * Counts rows in a table.
   *
   * @param table - Table name; a literal from this file, never input.
   * @returns The row count.
   */
  const countRows = async (table: string) =>
    (await database.query(`SELECT count(*)::int AS total FROM ${table}`)).rows[0].total as number;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    // Set before importing db.ts, which reads DATABASE_URL when it first
    // builds the pool.
    process.env.DATABASE_URL = TEST_URL;
    const dbModule = await import("@/server/common/db");
    await dbModule.ensureMigrated();
    ({ snapshot } = dbModule);
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({ deleteSettlement, getExpense, listExpenses, recordSettlement } = await import(
      "./expense.usecase"
    ));
    ({ getFriendLedger, netWithUser, owedByScope, userNetInGroup } = await import(
      "./balance.usecase"
    ));
    ({ mergeAccounts } = await import("@/server/auth/repo/accountMerge.repo"));

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await seed(database);
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("shows the dialog the position the write will settle: one net, one-off counted with the groups", async () => {
    const mine = (await getFriendLedger(PAYER, OWED)).settlePositions;
    const dollars = mine.find((position) => position.currency === "USD");
    expect(dollars?.netCents).toBe(-1269);
    expect(dollars?.scopes.map((scope) => `${scope.groupId || "direct"} ${scope.netCents}`).sort()).toEqual([
      "direct -22377",
      "grp-catskills 19551",
      "grp-reunion 1557",
    ]);
    expect(mine.find((position) => position.currency === "EUR")?.netCents).toBe(7599);

    // The other person sees the mirror of it, and the same fingerprint.
    const theirs = (await getFriendLedger(OWED, PAYER)).settlePositions.find(
      (position) => position.currency === "USD",
    );
    expect(theirs?.netCents).toBe(1269);
    expect(theirs?.digest).toBe(dollars?.digest);
    expect(dollars?.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to settle without the position, or against one that has moved", async () => {
    await expect(recordSettlement(PAYER, await netRequest(1269, { positionDigest: "" }))).rejects.toThrow(
      /must name the balances it settles/,
    );
    // The dialog was opened, then somebody added an expense.
    const stale = await netRequest(1269);
    await insertDebt(database, { id: "exp-coffee", groupId: null, amountCents: 450, currency: "USD", paidBy: OWED, owedBy: PAYER });
    await expect(recordSettlement(PAYER, stale)).rejects.toThrow(/balances changed since you opened this/);
    await database.query(`DELETE FROM expense_splits WHERE expense_id = 'exp-coffee'`);
    await database.query(`DELETE FROM expense_payers WHERE expense_id = 'exp-coffee'`);
    await database.query(`DELETE FROM expenses WHERE id = 'exp-coffee'`);
    expect(await countRows("settlements")).toBe(0);
    expect(await countRows("net_settlements")).toBe(0);
  });

  it("refuses more than the net, the wrong side, and any attempt to narrow it", async () => {
    // 223.77 is owed in the direct slate, but only 12.69 overall.
    await expect(recordSettlement(PAYER, await netRequest(1270))).rejects.toThrow(
      /exceeds what you owe overall \(USD 12\.69\)/,
    );
    await expect(
      recordSettlement(OWED, await netRequest(100, { toUserId: PAYER })),
    ).rejects.toThrow(/you don't owe this person anything overall in USD/);
    await expect(
      recordSettlement(PAYER, await netRequest(1269, { groupId: "grp-catskills" })),
    ).rejects.toThrow(/cannot name a group/);
    await expect(
      recordSettlement(PAYER, await netRequest(1269, { scopeGroupIds: [""] })),
    ).rejects.toThrow(/cannot name a group/);
    expect(await countRows("settlements")).toBe(0);
  });

  it("on a partial payment clears what points the other way and leaves the rest of the net owed", async () => {
    await recordSettlement(PAYER, await netRequest(600));
    expect(await scopesBetween(PAYER, OWED)).toEqual({
      // 223.77 - 6.00 cash - 211.08 cancelled = 6.69, the net less the payment.
      firstOwes: ["direct USD 669"],
      secondOwes: ["grp-lisbon EUR 7599"],
    });
    expect((await netWithUser(PAYER, OWED)).get("USD")).toBe(-669);
    expect(await userNetInGroup(OWED, "grp-catskills")).toBe(0);
    expect(await userNetInGroup(OWED, "grp-reunion")).toBe(0);
  });

  it("stores the cash and the cancellations as one unit under a parent that states their totals", async () => {
    const parents = await database.query(`SELECT id, currency, cash_cents, offset_cents FROM net_settlements`);
    expect(parents.rows).toHaveLength(1);
    expect(parents.rows[0]).toMatchObject({ currency: "USD", cash_cents: 600, offset_cents: 21108 });
    const { rows } = await database.query(
      `SELECT coalesce(group_id, 'direct') AS scope, from_user, to_user, amount_cents, method, net_settlement_id
         FROM settlements ORDER BY method, scope`,
    );
    const parentId = parents.rows[0].id;
    expect(rows).toEqual([
      { scope: "direct", from_user: PAYER, to_user: OWED, amount_cents: 21108, method: "offset", net_settlement_id: parentId },
      { scope: "grp-catskills", from_user: OWED, to_user: PAYER, amount_cents: 19551, method: "offset", net_settlement_id: parentId },
      { scope: "grp-reunion", from_user: OWED, to_user: PAYER, amount_cents: 1557, method: "offset", net_settlement_id: parentId },
      { scope: "direct", from_user: PAYER, to_user: OWED, amount_cents: 600, method: "venmo", net_settlement_id: parentId },
    ]);
  });

  it("tells both people exactly what happened, each from their own side", async () => {
    const feed = await database.query(`SELECT type, message FROM activity ORDER BY type, message`);
    expect(feed.rows).toEqual([
      // The one real payment, and what it left.
      { type: "settlement", message: "Ani paid Sam USD 6.00 — USD 6.69 still owed overall in USD" },
      // Each cancelled balance, in the scope it lived in, naming who owed whom.
      { type: "settlement_offset", message: 'USD 15.57 Sam owed Ani in "grp-reunion" was cancelled against what Ani owed Sam — no money moved for this part' },
      { type: "settlement_offset", message: 'USD 195.51 Sam owed Ani in "grp-catskills" was cancelled against what Ani owed Sam — no money moved for this part' },
      { type: "settlement_offset", message: "USD 211.08 Ani owed Sam outside groups was cancelled against what Sam owed Ani — no money moved for this part" },
    ]);
    const notice = await database.query(`SELECT user_id, title, body FROM notifications`);
    expect(notice.rows).toEqual([
      {
        user_id: OWED,
        title: "Ani recorded a payment of USD 6.00 to you",
        body: "USD 211.08 you each owed the other in USD was cancelled. Ani still owes Sam USD 6.69.",
      },
    ]);

    const describeLines = async (viewerId: string, friendId: string) =>
      (await getFriendLedger(viewerId, friendId)).entries
        .filter((entry) => entry.kind === "settlement")
        .map((entry) => `${entry.description} | ${entry.groupName || "one-off"} | ${entry.totalCents} | offset=${entry.offset} | linked=${entry.netSettlementId !== ""}`)
        .sort();
    expect(await describeLines(PAYER, OWED)).toEqual([
      "Cancelled: what Sam owed you | grp-catskills | 19551 | offset=true | linked=true",
      "Cancelled: what Sam owed you | grp-reunion | 1557 | offset=true | linked=true",
      "Cancelled: what you owed Sam | one-off | 21108 | offset=true | linked=true",
      "You paid | one-off | 600 | offset=false | linked=true",
    ]);
    expect(await describeLines(OWED, PAYER)).toEqual([
      "Ani paid you | one-off | 600 | offset=false | linked=true",
      "Cancelled: what Ani owed you | one-off | 21108 | offset=true | linked=true",
      "Cancelled: what you owed Ani | grp-catskills | 19551 | offset=true | linked=true",
      "Cancelled: what you owed Ani | grp-reunion | 1557 | offset=true | linked=true",
    ]);

    // Newest first, the payment leads and everything it cancelled follows
    // directly beneath it, in the same order for both people.
    const lineOrder = async (viewerId: string, friendId: string) =>
      (await getFriendLedger(viewerId, friendId)).entries
        .filter((entry) => entry.kind === "settlement")
        .map((entry) => (entry.offset ? `cancelled ${entry.totalCents}` : `paid ${entry.totalCents}`));
    const payerOrder = await lineOrder(PAYER, OWED);
    expect(payerOrder[0]).toBe("paid 600");
    expect(payerOrder.slice(1).every((label) => label.startsWith("cancelled"))).toBe(true);
    expect(await lineOrder(OWED, PAYER)).toEqual(payerOrder);
  });

  it("is refused by the database itself when anything tries to take the unit apart", async () => {
    const { rows } = await database.query(
      `SELECT id, method, coalesce(group_id, 'direct') AS scope FROM settlements`,
    );
    const catskillsOffset = rows.find((stored) => stored.scope === "grp-catskills").id;
    const cash = rows.find((stored) => stored.method === "venmo").id;
    // Removing one cancelled balance alone: its counterpart would cancel nothing.
    await expect(
      database.query(`UPDATE settlements SET deleted_at = now() WHERE id = $1`, [catskillsOffset]),
    ).rejects.toThrow(/only partly removed/);
    // Changing the cash without the parent agreeing.
    await expect(
      database.query(`UPDATE settlements SET amount_cents = amount_cents + 1 WHERE id = $1`, [cash]),
    ).rejects.toThrow(/cents of cash/);
    // Changing one side of the cancellation.
    await expect(
      database.query(`UPDATE settlements SET amount_cents = amount_cents - 1 WHERE id = $1`, [catskillsOffset]),
    ).rejects.toThrow(/does not cancel out/);
    // Deleting one row outright.
    await expect(database.query(`DELETE FROM settlements WHERE id = $1`, [catskillsOffset])).rejects.toThrow(
      /does not cancel out/,
    );
    // A cancelling entry that belongs to nothing.
    await expect(
      database.query(
        `INSERT INTO settlements (id, group_id, from_user, to_user, amount_cents, currency, method, note, recorded_by)
         VALUES ('stray', NULL, $1, $2, 100, 'USD', 'offset', '', $1)`,
        [PAYER, OWED],
      ),
    ).rejects.toThrow(/chk_settlements_offset_has_parent/);
    // Every refusal rolled back: the unit is exactly as it was.
    expect(await scopesBetween(PAYER, OWED)).toEqual({
      firstOwes: ["direct USD 669"],
      secondOwes: ["grp-lisbon EUR 7599"],
    });
  });

  it("removes the whole unit when any one of its rows is removed, by either person", async () => {
    const catskillsOffset = (
      await database.query(`SELECT id FROM settlements WHERE group_id = 'grp-catskills'`)
    ).rows[0].id;
    // Sam removes it, by way of a cancelled balance rather than the payment.
    await deleteSettlement(OWED, catskillsOffset);
    const state = await database.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS removed,
              count(DISTINCT deleted_by)::int AS removers FROM settlements`,
    );
    expect(state.rows[0]).toEqual({ total: 4, removed: 4, removers: 1 });
    // Every balance is back exactly where it started.
    expect(await scopesBetween(PAYER, OWED)).toEqual({
      firstOwes: ["direct USD 22377"],
      secondOwes: ["grp-catskills USD 19551", "grp-lisbon EUR 7599", "grp-reunion USD 1557"],
    });
    expect((await netWithUser(PAYER, OWED)).get("USD")).toBe(-1269);

    const removals = await database.query(
      `SELECT message FROM activity WHERE type = 'settlement_deleted' ORDER BY message`,
    );
    expect(removals.rows.map((stored) => stored.message)).toEqual([
      'Sam removed a payment that had cancelled USD 15.57 Sam owed Ani in "grp-reunion" — that is owed again',
      'Sam removed a payment that had cancelled USD 195.51 Sam owed Ani in "grp-catskills" — that is owed again',
      "Sam removed a payment that had cancelled USD 211.08 Ani owed Sam outside groups — that is owed again",
      'Sam removed the payment "Ani paid Sam USD 6.00" and everything it had cancelled',
    ]);
    const notice = await database.query(
      `SELECT user_id, title, body FROM notifications WHERE type = 'settlement_deleted'`,
    );
    expect(notice.rows).toEqual([
      {
        user_id: PAYER,
        title: "Sam removed the payment of USD 6.00",
        body: "The USD 211.08 it had cancelled each way is owed again, exactly as before the payment.",
      },
    ]);
    // Already removed: a second attempt, through any row, finds nothing to remove.
    await expect(deleteSettlement(PAYER, catskillsOffset)).rejects.toThrow(/payment not found/);
  });

  it("settles the full net and leaves every dollar scope at zero, the euros untouched", async () => {
    await recordSettlement(PAYER, await netRequest(1269));
    expect(await scopesBetween(PAYER, OWED)).toEqual({ firstOwes: [], secondOwes: ["grp-lisbon EUR 7599"] });
    const nets = await netWithUser(PAYER, OWED);
    expect(nets.get("USD") ?? 0).toBe(0);
    expect(nets.get("EUR")).toBe(7599);
    const message = (
      await database.query(`SELECT message FROM activity WHERE type = 'settlement' ORDER BY created_at DESC LIMIT 1`)
    ).rows[0].message;
    expect(message).toBe("Ani paid Sam USD 12.69 — settles everything between them in USD");
    const notice = (
      await database.query(`SELECT body FROM notifications WHERE type = 'settlement' ORDER BY created_at DESC LIMIT 1`)
    ).rows[0].body;
    expect(notice).toBe(
      "You two are settled up in USD. USD 211.08 you each owed the other was cancelled, so only the difference was paid.",
    );
    // Nothing left to settle in dollars: the dialog has no dollar position to show.
    expect((await getFriendLedger(PAYER, OWED)).settlePositions.map((position) => position.currency)).toEqual(["EUR"]);
  });

  it("answers a retried recording with the first one instead of recording again", async () => {
    await insertDebt(database, { id: "exp-taxi", groupId: null, amountCents: 5000, currency: "USD", paidBy: OWED, owedBy: PAYER });
    await insertDebt(database, { id: "exp-snacks", groupId: "grp-reunion", amountCents: 2000, currency: "USD", paidBy: PAYER, owedBy: OWED });
    const before = await countRows("settlements");
    const request = await netRequest(3000, { operationId: "0f8fad5b-d9cb-469f-a165-70867728950e" });
    const first = await recordSettlement(PAYER, request);
    const again = await recordSettlement(PAYER, request);
    expect(again.id).toBe(first.id);
    // One cash row and one cancellation each way, once.
    expect((await countRows("settlements")) - before).toBe(3);
    expect(await scopesBetween(PAYER, OWED)).toEqual({ firstOwes: [], secondOwes: ["grp-lisbon EUR 7599"] });
  });

  it("is an ordinary payment, with no parent, when nothing points the other way", async () => {
    await insertDebt(database, { id: "exp-museum", groupId: null, amountCents: 4000, currency: "USD", paidBy: OWED, owedBy: PAYER });
    const parentsBefore = await countRows("net_settlements");
    const stored = await recordSettlement(PAYER, await netRequest(4000));
    expect(await countRows("net_settlements")).toBe(parentsBefore);
    const storedRow = (await database.query(`SELECT method, net_settlement_id FROM settlements WHERE id = $1`, [stored.id])).rows[0];
    expect(storedRow).toEqual({ method: "venmo", net_settlement_id: null });
  });

  it("survives an account merge whole: the unit moves to the surviving account and still cancels out", async () => {
    // An invited person, never signed in, has a net settlement with Sam...
    await insertGroup(database, "grp-picnic", "USD", OWED, INVITED);
    await insertDebt(database, { id: "exp-tickets", groupId: null, amountCents: 5000, currency: "USD", paidBy: OWED, owedBy: INVITED });
    await insertDebt(database, { id: "exp-basket", groupId: "grp-picnic", amountCents: 2000, currency: "USD", paidBy: INVITED, owedBy: OWED });
    await recordSettlement(INVITED, {
      groupId: "",
      toUserId: OWED,
      amountCents: 3000,
      currency: "USD",
      method: "cash",
      note: "",
      netAcrossScopes: true,
      positionDigest: await digestShown(INVITED, OWED),
    });
    const unitId = (
      await database.query(`SELECT DISTINCT net_settlement_id FROM settlements WHERE from_user = $1 OR to_user = $1`, [INVITED])
    ).rows[0].net_settlement_id;
    expect(unitId).toBeTruthy();

    // ...and is then absorbed into a real account. The merge repoints the
    // rows one statement at a time; the integrity check runs at commit.
    await mergeAccounts(KEEPER, INVITED, null, { adoptPhone: false });

    const rows = await database.query(
      `SELECT from_user, to_user, method, amount_cents FROM settlements
        WHERE net_settlement_id = $1 ORDER BY method, amount_cents`,
      [unitId],
    );
    expect(rows.rows).toEqual([
      { from_user: KEEPER, to_user: OWED, method: "cash", amount_cents: 3000 },
      { from_user: KEEPER, to_user: OWED, method: "offset", amount_cents: 2000 },
      { from_user: OWED, to_user: KEEPER, method: "offset", amount_cents: 2000 },
    ]);
    expect(await scopesBetween(KEEPER, OWED)).toEqual({ firstOwes: [], secondOwes: [] });
    // And the survivor can still remove it, whole.
    const cash = (
      await database.query(`SELECT id FROM settlements WHERE net_settlement_id = $1 AND method = 'cash'`, [unitId])
    ).rows[0].id;
    await deleteSettlement(KEEPER, cash);
    expect(await scopesBetween(KEEPER, OWED)).toEqual({
      firstOwes: ["direct USD 5000"],
      secondOwes: ["grp-picnic USD 2000"],
    });
  });

  /**
   * Records the keeper settling with Sam on the net of what is on screen.
   *
   * @returns The recorded payment.
   */
  const settleKeeperOnNet = async () =>
    recordSettlement(KEEPER, {
      groupId: "",
      toUserId: OWED,
      amountCents: 3000,
      currency: "USD",
      method: "cash",
      note: "",
      netAcrossScopes: true,
      positionDigest: await digestShown(KEEPER, OWED),
    });

  it("reads a position from one instant, even when a settlement commits in the middle of the read", async () => {
    const describeDebts = (debts: { groupId: string | null; currency: string; owedCents: number }[]) =>
      debts.map((debt) => `${debt.groupId ?? "direct"} ${debt.currency} ${debt.owedCents}`).sort();
    let recordedId = "";
    const seen = await snapshot(async (client) => {
      // The first statement fixes the instant this read sees.
      const keeperOwes = describeDebts(await owedByScope(KEEPER, OWED, client));
      // The pair now settles on the net, on another connection, and it commits.
      recordedId = (await settleKeeperOnNet()).id;
      // The second half of the same read. Taken from the ledger as it stands
      // now it would say Sam owes nothing, beside a first half that still
      // has the keeper owing 50.00: a position that never existed.
      const samOwes = describeDebts(await owedByScope(OWED, KEEPER, client));
      return { keeperOwes, samOwes };
    });
    expect(seen).toEqual({ keeperOwes: ["direct USD 5000"], samOwes: ["grp-picnic USD 2000"] });
    // A read that starts afterwards sees the settlement, whole.
    expect(await scopesBetween(KEEPER, OWED)).toEqual({ firstOwes: [], secondOwes: [] });

    await deleteSettlement(OWED, recordedId);
    expect(await scopesBetween(KEEPER, OWED)).toEqual({
      firstOwes: ["direct USD 5000"],
      secondOwes: ["grp-picnic USD 2000"],
    });
  });

  it("never returns a position that did not exist, however reads and settlements interleave", async () => {
    // The only two states this pair is ever in while the loop below runs.
    const OWING = "direct -5000, grp-picnic 2000 = -3000";
    const SETTLED = "settled";
    const observed = new Set<string>();
    const disagreements = new Set<string>();
    let writing = true;

    const readWhileWriting = async () => {
      while (writing) {
        const ledger = await getFriendLedger(KEEPER, OWED);
        const dollars = ledger.settlePositions.find((position) => position.currency === "USD");
        observed.add(
          dollars
            ? `${dollars.scopes
                .map((scope) => `${scope.groupId || "direct"} ${scope.netCents}`)
                .sort()
                .join(", ")} = ${dollars.netCents}`
            : SETTLED,
        );
        // The headline, the statement's running balance and the settle
        // position are three readings of one ledger, and must agree.
        const headline = ledger.nets.find((bucket) => bucket.currency === "USD")?.cents ?? 0;
        const running =
          ledger.entries.find((entry) => entry.currency === "USD")?.balanceAfterCents ?? 0;
        const position = dollars?.netCents ?? 0;
        if (headline !== position || running !== position) {
          disagreements.add(`headline ${headline}, statement ${running}, position ${position}`);
        }
      }
    };
    const readers = Array.from({ length: 6 }, () => readWhileWriting());
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const recorded = await settleKeeperOnNet();
      await deleteSettlement(OWED, recorded.id);
    }
    writing = false;
    await Promise.all(readers);

    expect([...observed].filter((state) => state !== OWING && state !== SETTLED)).toEqual([]);
    expect([...disagreements]).toEqual([]);
    expect(observed.has(OWING)).toBe(true);
  }, 60_000);

  it("settles one balance alone when asked to, and leaves the ones pointing the other way standing", async () => {
    // The keeper owes Sam 50.00 outside groups; Sam owes the keeper 20.00 in
    // the picnic group. Settling a single row is a plain payment in that
    // scope: nothing is cancelled and nothing else moves.
    const parentsBefore = await countRows("net_settlements");
    const targeted = {
      groupId: "",
      amountCents: 0,
      currency: "USD",
      method: "cash",
      note: "",
      netAcrossScopes: false,
      positionDigest: "",
    };
    // More than that one balance holds is refused, even though the pair owe
    // more than that elsewhere.
    await expect(
      recordSettlement(OWED, { ...targeted, toUserId: KEEPER, amountCents: 2001, scopeGroupIds: ["grp-picnic"] }),
    ).rejects.toThrow(/exceeds/);
    // A balance cannot be "settled" by the person who is owed it.
    await expect(
      recordSettlement(KEEPER, { ...targeted, toUserId: OWED, amountCents: 2000, scopeGroupIds: ["grp-picnic"] }),
    ).rejects.toThrow();

    await recordSettlement(KEEPER, { ...targeted, toUserId: OWED, amountCents: 5000, scopeGroupIds: [""] });
    expect(await scopesBetween(KEEPER, OWED)).toEqual({ firstOwes: [], secondOwes: ["grp-picnic USD 2000"] });
    expect((await netWithUser(KEEPER, OWED)).get("USD")).toBe(2000);

    // The other row, recorded by the person receiving it.
    await recordSettlement(KEEPER, {
      ...targeted,
      toUserId: OWED,
      amountCents: 2000,
      scopeGroupIds: ["grp-picnic"],
      received: true,
    });
    expect(await scopesBetween(KEEPER, OWED)).toEqual({ firstOwes: [], secondOwes: [] });
    // Two ordinary payments: no unit, nothing cancelled.
    expect(await countRows("net_settlements")).toBe(parentsBefore);
    const stored = await database.query(
      `SELECT from_user, coalesce(group_id, 'direct') AS scope, method, amount_cents, recorded_by, net_settlement_id
         FROM settlements WHERE deleted_at IS NULL AND (from_user = $1 OR to_user = $1) ORDER BY amount_cents`,
      [KEEPER],
    );
    expect(stored.rows).toEqual([
      { from_user: OWED, scope: "grp-picnic", method: "cash", amount_cents: 2000, recorded_by: KEEPER, net_settlement_id: null },
      { from_user: KEEPER, scope: "direct", method: "cash", amount_cents: 5000, recorded_by: KEEPER, net_settlement_id: null },
    ]);
  });

  it("settles everything the same way when the person being paid records it", async () => {
    await insertDebt(database, { id: "exp-ferry", groupId: null, amountCents: 7000, currency: "USD", paidBy: OWED, owedBy: KEEPER });
    await insertDebt(database, { id: "exp-ice", groupId: "grp-picnic", amountCents: 3000, currency: "USD", paidBy: KEEPER, owedBy: OWED });
    // Sam is owed 40.00 on the net, and is the one who types it in.
    const shown = (await getFriendLedger(OWED, KEEPER)).settlePositions.find(
      (position) => position.currency === "USD",
    );
    expect(shown?.netCents).toBe(4000);
    await recordSettlement(OWED, {
      groupId: "",
      toUserId: KEEPER,
      amountCents: 4000,
      currency: "USD",
      method: "cash",
      note: "",
      received: true,
      netAcrossScopes: true,
      positionDigest: shown?.digest ?? "",
    });
    expect(await scopesBetween(KEEPER, OWED)).toEqual({ firstOwes: [], secondOwes: [] });
    const unit = await database.query(
      `SELECT net.cash_cents, net.offset_cents, count(*)::int AS line_count, count(DISTINCT stl.recorded_by)::int AS recorders
         FROM net_settlements net JOIN settlements stl ON stl.net_settlement_id = net.id
        WHERE stl.deleted_at IS NULL AND (stl.from_user = $1 OR stl.to_user = $1)
        GROUP BY net.id`,
      [KEEPER],
    );
    expect(unit.rows).toEqual([{ cash_cents: 4000, offset_cents: 3000, line_count: 3, recorders: 1 }]);
    // The payer is the keeper, whoever typed it in.
    const cash = await database.query(
      `SELECT from_user, recorded_by FROM settlements WHERE method = 'cash' AND amount_cents = 4000 AND deleted_at IS NULL`,
    );
    expect(cash.rows).toEqual([{ from_user: KEEPER, recorded_by: OWED }]);
  });

  it("lists every expense whole: its amount, who paid and who owes always from the same version", async () => {
    await insertDebt(database, { id: "exp-flip", groupId: null, amountCents: 10000, currency: "USD", paidBy: OWED, owedBy: PAYER });
    const torn = new Set<string>();
    let editing = true;
    /**
     * Records an expense whose parts do not add up to its amount.
     *
     * @param expense - The expense as a read returned it.
     */
    const check = (expense: { id: string; amountCents: number; payers: { amountCents: number }[]; splits: { owedCents: number }[] }) => {
      const paid = expense.payers.reduce((running, payer) => running + payer.amountCents, 0);
      const owedTotal = expense.splits.reduce((running, split) => running + split.owedCents, 0);
      if (paid !== expense.amountCents || owedTotal !== expense.amountCents) {
        torn.add(`${expense.id}: amount ${expense.amountCents}, paid ${paid}, owed ${owedTotal}`);
      }
    };
    const readWhileEditing = async () => {
      while (editing) {
        for (const expense of (await listExpenses(PAYER, {})).expenses) check(expense);
        const detail = (await getExpense(PAYER, "exp-flip")).expense;
        check(detail);
      }
    };
    const readers = Array.from({ length: 6 }, () => readWhileEditing());
    // An edit replaces the amount and the shares together, in one
    // transaction; a read must see all of the old version or all of the new.
    for (let round = 0; round < 40; round += 1) {
      const amountCents = round % 2 === 0 ? 12000 : 10000;
      await database.query("BEGIN");
      await database.query(`UPDATE expenses SET amount_cents = $1 WHERE id = 'exp-flip'`, [amountCents]);
      await database.query(`UPDATE expense_payers SET amount_cents = $1 WHERE expense_id = 'exp-flip'`, [amountCents]);
      await database.query(`UPDATE expense_splits SET owed_cents = $1 WHERE expense_id = 'exp-flip'`, [amountCents]);
      await database.query("COMMIT");
    }
    editing = false;
    await Promise.all(readers);
    expect([...torn]).toEqual([]);
  }, 60_000);
});

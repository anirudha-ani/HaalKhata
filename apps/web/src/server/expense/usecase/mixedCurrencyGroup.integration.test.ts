/**
 * Real PostgreSQL regressions: a group that holds a
 * payment in a currency other than its own. Group payments are kept to the
 * group's currency today, but until 30 August 2026 a "settle everything"
 * payment was split across a pair's balances and stamped with the payment's
 * currency, so a euro payment could land in a dollar group. A dollar owed
 * and a euro paid are two balances, never a settled zero, on every surface
 * that reads a group's ledger.
 */

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GroupStatus } from "@haalkhata/protogen/group/v1/group_pb";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_mixed_currency_group_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const ANA_ID = "mixed-ana";
const BEN_ID = "mixed-ben";
const CARA_ID = "mixed-cara";
const GOA_ID = "grp-goa";

/**
 * Checks database availability while always closing the probe connection.
 * @returns Whether the isolated PostgreSQL suite can run.
 */
async function databaseReachable(): Promise<boolean> {
  const probe = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.end();
  }
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("a dollar group holding a euro payment", () => {
  let database: Client;
  let expenses: typeof import("./expense.usecase");
  let balances: typeof import("./balance.usecase");
  let groups: typeof import("@/server/group/usecase/group.usecase");
  let closePool: () => Promise<void>;

  /**
   * A payment the way the code before 30 August 2026 could store it: in the
   * group, in a currency that is not the group's.
   *
   * @param fromUser - Who paid.
   * @param toUser - Who was paid.
   * @param amountCents - How much.
   * @param currency - The payment's currency.
   */
  async function legacyPayment(fromUser: string, toUser: string, amountCents: number, currency: string) {
    await database.query(
      `INSERT INTO settlements (id, group_id, from_user, to_user, amount_cents, currency, method, recorded_by)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'cash', $2)`,
      [GOA_ID, fromUser, toUser, amountCents, currency],
    );
  }

  /**
   * A dollar expense one person paid in full for another, through the real usecase.
   *
   * @param payer - Who paid.
   * @param ower - Who owes all of it.
   * @param amountCents - How much.
   * @param description - Its name.
   * @returns The stored expense.
   */
  function expenseFor(payer: string, ower: string, amountCents: number, description: string) {
    return expenses.createExpense(payer, {
      groupId: GOA_ID,
      description,
      amountCents,
      currency: "USD",
      category: "transport",
      expenseDate: "2026-08-12",
      splitType: "exact",
      notes: "",
      payers: [{ userId: payer, amountCents }],
      splitSpecs: [{ userId: ower, amountCents, percentBp: 0, shares: 0 }],
      items: [],
      taxCents: 0,
      tipCents: 0,
    } as never);
  }

  /**
   * Records a payment between two members in the group.
   *
   * @param payer - Who paid, recording it.
   * @param recipient - Who was paid.
   * @param amountCents - How much.
   * @param currency - In what.
   * @returns The stored settlement.
   */
  function recordGroupPayment(payer: string, recipient: string, amountCents: number, currency: string) {
    return expenses.recordSettlement(payer, {
      groupId: GOA_ID,
      toUserId: recipient,
      amountCents,
      currency,
      method: "cash",
      note: "",
    });
  }

  /**
   * @param userId - Whose overall position to read.
   * @param counterpartyId - Against whom.
   * @returns Their balances against that person, per currency.
   */
  async function overallAgainst(userId: string, counterpartyId: string) {
    const overall = await balances.getOverallBalances(userId);
    return overall.counterparties.find((entry) => entry.user?.id === counterpartyId)?.balances ?? [];
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    await (await import("@/server/common/db/db")).ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    expenses = await import("./expense.usecase");
    balances = await import("./balance.usecase");
    groups = await import("@/server/group/usecase/group.usecase");
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub, default_currency)
       VALUES ($1, 'ana@example.com', 'Ana', '#c73e2e', now(), 'google-ana', 'USD'),
              ($2, 'ben@example.com', 'Ben', '#0f8a5f', now(), 'google-ben', 'USD'),
              ($3, 'cara@example.com', 'Cara', '#336699', now(), 'google-cara', 'USD')`,
      [ANA_ID, BEN_ID, CARA_ID],
    );
  }, 60_000);

  beforeEach(async () => {
    await database.query("TRUNCATE groups, expenses, settlements, activity, notifications, operations CASCADE");
    await database.query(`INSERT INTO groups (id, name, created_by, currency) VALUES ($1, 'Goa trip', $2, 'USD')`, [
      GOA_ID,
      ANA_ID,
    ]);
    await database.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`,
      [GOA_ID, ANA_ID, BEN_ID, CARA_ID],
    );
    // Ben owes Ana $100, and paid her €100 toward it in August.
    await expenseFor(ANA_ID, BEN_ID, 10000, "Taxi");
    await legacyPayment(BEN_ID, ANA_ID, 10000, "EUR");
  });

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("does not let Ben leave, or be removed, while either currency is open", async () => {
    expect(await balances.userNetInGroup(BEN_ID, GOA_ID)).toEqual(new Map([["USD", -10000], ["EUR", 10000]]));
    await expect(groups.removeMemberFromGroup(BEN_ID, { groupId: GOA_ID, userId: BEN_ID })).rejects.toMatchObject({
      code: "invalid_argument",
    });
    await expect(groups.removeMemberFromGroup(ANA_ID, { groupId: GOA_ID, userId: BEN_ID })).rejects.toMatchObject({
      code: "invalid_argument",
    });
  });

  it("shows the group's balances in each currency, its own first", async () => {
    const shown = await balances.getGroupBalances(CARA_ID, GOA_ID);

    expect(shown.byCurrency.map((bucket) => bucket.currency)).toEqual(["USD", "EUR"]);
    const [dollars, euros] = shown.byCurrency;
    expect(dollars.nets).toEqual(
      [
        { userId: ANA_ID, netCents: 10000 },
        { userId: BEN_ID, netCents: -10000 },
        { userId: CARA_ID, netCents: 0 },
      ].sort((first, second) => first.userId.localeCompare(second.userId)),
    );
    expect(dollars.debts).toEqual([{ fromUserId: BEN_ID, toUserId: ANA_ID, amountCents: 10000 }]);
    // Ana holds €100 of Ben's that paid off nothing in euros.
    expect(euros.nets).toEqual([
      { userId: ANA_ID, netCents: -10000 },
      { userId: BEN_ID, netCents: 10000 },
    ]);
    expect(euros.debts).toEqual([{ fromUserId: ANA_ID, toUserId: BEN_ID, amountCents: 10000 }]);
    // Older clients read the group's own currency at the top level.
    expect(shown.nets).toEqual(dollars.nets);
    expect(shown.debts).toEqual(dollars.debts);
  });

  it("lists Ben's position in the group per currency, and on his dashboard, pairwise or simplified", async () => {
    const [summary] = await groups.listGroups(BEN_ID);
    expect(summary.yourNetCents).toBe(-10000);
    expect(summary.yourBalances).toEqual([
      { currency: "USD", cents: -10000 },
      { currency: "EUR", cents: 10000 },
    ]);

    const expected = [
      { currency: "USD", cents: -10000 },
      { currency: "EUR", cents: 10000 },
    ];
    expect(await overallAgainst(BEN_ID, ANA_ID)).toEqual(expected);
    // Simplified, the group's edges used to be filed under its currency, so
    // the euro payment cancelled the dollar debt: Ben read as settled.
    await database.query("UPDATE groups SET simplify_debts = true WHERE id = $1", [GOA_ID]);
    expect(await overallAgainst(BEN_ID, ANA_ID)).toEqual(expected);
  });

  it("keeps the dollar expense pending while dollars are owed, whatever the euros say", async () => {
    const listed = await expenses.listExpenses(BEN_ID, { groupId: GOA_ID }, { cursor: "", limit: 20 });
    expect(listed.settledExpenseIds).toEqual([]);
    await recordGroupPayment(BEN_ID, ANA_ID, 10000, "USD");
    const after = await expenses.listExpenses(BEN_ID, { groupId: GOA_ID }, { cursor: "", limit: 20 });
    expect(after.settledExpenseIds).toHaveLength(1);
  });

  it("lets each currency be paid in itself, and nothing in a currency the group holds nothing in", async () => {
    await expect(recordGroupPayment(ANA_ID, BEN_ID, 10000, "GBP")).rejects.toMatchObject({
      message: "this group settles in USD, not GBP",
    });
    await expect(recordGroupPayment(ANA_ID, BEN_ID, 10001, "EUR")).rejects.toMatchObject({ code: "invalid_argument" });
    // Ana hands the euros back; Ben pays the dollars.
    await recordGroupPayment(ANA_ID, BEN_ID, 10000, "EUR");
    expect(await balances.userNetInGroup(BEN_ID, GOA_ID)).toEqual(new Map([["USD", -10000]]));
    await recordGroupPayment(BEN_ID, ANA_ID, 10000, "USD");
    expect(await balances.userNetInGroup(BEN_ID, GOA_ID)).toEqual(new Map());

    await groups.removeMemberFromGroup(BEN_ID, { groupId: GOA_ID, userId: BEN_ID });
    await groups.setStatus(ANA_ID, { groupId: GOA_ID, status: GroupStatus.ARCHIVED });
    const { rows } = await database.query("SELECT status FROM groups WHERE id = $1", [GOA_ID]);
    expect(rows).toEqual([{ status: "archived" }]);
  });

  it("pays a picked group's balance in the payment's currency when it holds another too", async () => {
    // Ben now owes Ana in both currencies here: $100, and €40 she paid him
    // in the group in August.
    await database.query("DELETE FROM settlements WHERE group_id = $1", [GOA_ID]);
    await legacyPayment(ANA_ID, BEN_ID, 4000, "EUR");
    const payDollars = (amountCents: number) =>
      expenses.recordSettlement(BEN_ID, {
        groupId: "",
        toUserId: ANA_ID,
        scopeGroupIds: [GOA_ID],
        amountCents,
        currency: "USD",
        method: "cash",
        note: "",
      });

    // The euros are not dollars: $100 is all Ben owes in dollars. The ledger
    // used to read the €40 as $40 more and take a $140 payment.
    await expect(payDollars(10001)).rejects.toMatchObject({ code: "invalid_argument" });
    const stored = await payDollars(10000);

    expect(stored).toMatchObject({ groupId: GOA_ID, currency: "USD", amountCents: 10000 });
    expect(await balances.userNetInGroup(BEN_ID, GOA_ID)).toEqual(new Map([["EUR", -4000]]));
  });
});

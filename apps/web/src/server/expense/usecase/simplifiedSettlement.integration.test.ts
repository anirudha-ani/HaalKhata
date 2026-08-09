/**
 * Integration test for settling along a simplified edge, against a real
 * Postgres.
 *
 * The unit tests prove the routing math with mocks; what they cannot prove is
 * the end-to-end property the feature exists for: in a group that simplifies
 * debts, the rerouted payment (which may connect two people who never shared
 * an expense) is the one the guards accept — recorded exactly once even when
 * recorded twice at the same moment — while the pairwise route it replaced is
 * refused, so the same debt can never be paid down both ways.
 *
 * Scenario: Alice owes Bob 1000 (groceries), Bob owes Cara 1000 (dinner).
 * Simplified, that is one payment: Alice pays Cara.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_simplify_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const ALICE = "alice-1";
const BOBBY = "bob-1";
const CARA = "cara-1";
const TRIP = "trip-1";

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
 * Seeds the chain: three members, Bob paid for Alice's groceries, Cara paid
 * for Bob's dinner. Pairwise Alice→Bob 1000 and Bob→Cara 1000; nets are
 * Alice −1000, Bob 0, Cara +1000.
 *
 * @param database - Connected client on the test database.
 */
async function seed(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color, onboarded_at)
     VALUES ($1, 'alice@example.com', 'Alice Anders', '#c73e2e', now()),
            ($2, 'bob@example.com', 'Bob Barker', '#0f8a5f', now()),
            ($3, 'cara@example.com', 'Cara Castillo', '#3355aa', now())`,
    [ALICE, BOBBY, CARA],
  );
  await database.query(`INSERT INTO groups (id, name, created_by) VALUES ($1, 'Trip', $2)`, [
    TRIP,
    ALICE,
  ]);
  await database.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES
       ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`,
    [TRIP, ALICE, BOBBY, CARA],
  );
  await database.query(
    `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ('groceries-1', $1, 'Groceries', 1000, 'USD', '2026-08-01', 'exact', $2),
            ('dinner-1', $1, 'Dinner', 1000, 'USD', '2026-08-01', 'exact', $3)`,
    [TRIP, BOBBY, CARA],
  );
  await database.query(
    `INSERT INTO expense_payers (expense_id, user_id, amount_cents)
     VALUES ('groceries-1', $1, 1000), ('dinner-1', $2, 1000)`,
    [BOBBY, CARA],
  );
  await database.query(
    `INSERT INTO expense_splits (expense_id, user_id, owed_cents)
     VALUES ('groceries-1', $1, 1000), ('dinner-1', $2, 1000)`,
    [ALICE, BOBBY],
  );
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("simplified-edge settlement against Postgres", () => {
  let database: Client;
  let recordSettlement: typeof import("./expense.usecase").recordSettlement;
  let setSimplifyDebts: typeof import("@/server/group/usecase/group.usecase").setSimplifyDebts;
  let userNetInGroup: typeof import("./balance.usecase").userNetInGroup;
  let netWithUser: typeof import("./balance.usecase").netWithUser;
  let listActivity: typeof import("@/server/social/usecase/social.usecase").listActivity;
  let closePool: () => Promise<void>;

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
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({ recordSettlement } = await import("./expense.usecase"));
    ({ setSimplifyDebts } = await import("@/server/group/usecase/group.usecase"));
    ({ userNetInGroup, netWithUser } = await import("./balance.usecase"));
    ({ listActivity } = await import("@/server/social/usecase/social.usecase"));

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

  it("flips the persisted mode and announces it in the group's feed", async () => {
    const group = await setSimplifyDebts(ALICE, { groupId: TRIP, simplify: true });
    expect(group.simplifyDebts).toBe(true);

    const { rows } = await database.query(`SELECT simplify_debts FROM groups WHERE id = $1`, [
      TRIP,
    ]);
    expect(rows[0].simplify_debts).toBe(true);

    const feed = await database.query(
      `SELECT count(*)::int AS announcements FROM activity WHERE type = 'simplify_debts'`,
    );
    expect(feed.rows[0].announcements).toBe(1);
  });

  it("refuses the pairwise route the simplification replaced", async () => {
    // Alice's debt to Bob was rerouted into paying Cara. Accepting a payment
    // to Bob as well would be the double-count this design exists to prevent.
    await expect(
      recordSettlement(ALICE, {
        groupId: TRIP,
        toUserId: BOBBY,
        amountCents: 1000,
        currency: "USD",
        method: "cash",
        note: "",
      }),
    ).rejects.toThrow(/don't owe this person anything/);
    await expect(
      recordSettlement(ALICE, {
        groupId: "",
        toUserId: BOBBY,
        amountCents: 1000,
        currency: "USD",
        method: "cash",
        note: "",
      }),
    ).rejects.toThrow(/don't owe this person anything/);
  });

  it("records the simplified edge exactly once under a concurrent double-recording", async () => {
    // Alice and Cara never shared an expense; the edge exists only because
    // the group routes debt through the fewest payments. Recorded from the
    // friends page and the group page at the same moment, it must land once.
    const settle = (groupId: string) =>
      recordSettlement(ALICE, {
        groupId,
        toUserId: CARA,
        amountCents: 1000,
        currency: "USD",
        method: "cash",
        note: "",
      });
    const outcomes = await Promise.allSettled([settle(""), settle(TRIP)]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);

    const { rows } = await database.query(
      `SELECT group_id, from_user, to_user, amount_cents FROM settlements`,
    );
    expect(rows).toEqual([
      { group_id: TRIP, from_user: ALICE, to_user: CARA, amount_cents: 1000 },
    ]);
  });

  it("one payment settles the whole chain", async () => {
    for (const member of [ALICE, BOBBY, CARA]) {
      expect(await userNetInGroup(member, TRIP)).toBe(0);
    }
    expect(await netWithUser(ALICE, CARA)).toBe(0);
    expect(await netWithUser(BOBBY, ALICE)).toBe(0);
    expect(await netWithUser(BOBBY, CARA)).toBe(0);
  });

  it("tells the pair about the payment — and nobody else, on either feed", async () => {
    // Bob is a member of the group but not a party to Alice's payment to
    // Cara. His personal feed and the group's tab must both skip it; the
    // pair sees it in both. The group-structural events (the simplify
    // announcement) stay visible to everyone.
    for (const scope of [{}, { groupId: TRIP }]) {
      const bobFeed = await listActivity(BOBBY, scope);
      expect(bobFeed.events.some((event) => event.type === "settlement")).toBe(false);

      const aliceFeed = await listActivity(ALICE, scope);
      expect(aliceFeed.events.some((event) => event.type === "settlement")).toBe(true);
      const caraFeed = await listActivity(CARA, scope);
      expect(caraFeed.events.some((event) => event.type === "settlement")).toBe(true);
    }
    const bobGroupFeed = await listActivity(BOBBY, { groupId: TRIP });
    expect(bobGroupFeed.events.some((event) => event.type === "simplify_debts")).toBe(true);
  });

  it("refuses any further recording on any route", async () => {
    for (const [payer, creditor] of [
      [ALICE, CARA],
      [ALICE, BOBBY],
      [BOBBY, CARA],
    ]) {
      await expect(
        recordSettlement(payer, {
          groupId: "",
          toUserId: creditor,
          amountCents: 1000,
          currency: "USD",
          method: "cash",
          note: "",
        }),
      ).rejects.toThrow(/don't owe this person anything/);
    }
  });
});

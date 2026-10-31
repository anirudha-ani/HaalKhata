/**
 * Real PostgreSQL test that the narrow read of who somebody owes in a group
 * agrees with the whole ledger. It leaves out everybody else's rows, so what
 * it must never do is answer differently: a group has one route for its
 * debts, and a page and a guard reading two would let one debt be paid twice.
 * Random histories, in both of a group's modes, including debts that cancel
 * out around a loop, which is not debt at all.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_people_owed_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const MEMBERS = ["owed-ana", "owed-ben", "owed-cara", "owed-dev", "owed-eli", "owed-fay"];
const HISTORY = "grp-history";
const LOOP = "grp-loop";

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
    await probe.end().catch(() => undefined);
  }
}

const reachable = await databaseReachable();

/**
 * A repeatable source of numbers, so a failure can be run again.
 * @param seed - Where to start.
 * @returns A function giving a whole number below its limit.
 */
function randomFrom(seed: number) {
  let current = seed;
  return (limit: number) => {
    current = (current * 1103515245 + 12345) % 2147483648;
    return current % limit;
  };
}

describe.skipIf(!reachable)("who somebody owes in a group, against Postgres", () => {
  let database: Client;
  let balances: typeof import("./balance.usecase");
  let closePool: () => Promise<void>;

  /**
   * Adds one expense.
   *
   * @param expense - Its id, group, currency, who paid and who owes.
   */
  const addExpense = async (expense: {
    id: string; groupId: string; currency: string; payers: [string, number][]; owers: [string, number][]; deleted?: boolean;
  }) => {
    const total = expense.payers.reduce((running, [, cents]) => running + cents, 0);
    await database.query(
      `INSERT INTO expenses (id, group_id, description, amount_cents, currency, category, expense_date, split_type, created_by, deleted_at, deleted_by)
       VALUES ($1, $2, 'x', $3, $4, 'food', '2026-01-01', 'exact', $5, $6, $7)`,
      [expense.id, expense.groupId, total, expense.currency, MEMBERS[0], expense.deleted ? new Date() : null, expense.deleted ? MEMBERS[0] : null],
    );
    for (const [userId, cents] of expense.payers) {
      await database.query(`INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ($1, $2, $3)`, [expense.id, userId, cents]);
    }
    for (const [userId, cents] of expense.owers) {
      await database.query(`INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ($1, $2, $3)`, [expense.id, userId, cents]);
    }
  };

  /**
   * Adds one payment.
   *
   * @param payment - Its id, group, currency, who paid whom and how much.
   */
  const addPayment = async (payment: { id: string; groupId: string; currency: string; from: string; to: string; cents: number }) => {
    await database.query(
      `INSERT INTO settlements (id, group_id, from_user, to_user, amount_cents, currency, recorded_by, method)
       VALUES ($1, $2, $3, $4, $5, $6, $3, 'cash')`,
      [payment.id, payment.groupId, payment.from, payment.to, payment.cents, payment.currency],
    );
  };

  /**
   * What the whole ledger says one person owes.
   *
   * @param userId - The person.
   * @param groupId - The group.
   * @param currency - The currency.
   * @returns Who, sorted.
   */
  const fromWholeLedger = async (userId: string, groupId: string, currency: string) =>
    (await balances.memberDebtsInGroup(userId, groupId))
      .filter((debt) => debt.fromUserId === userId && debt.currency === currency)
      .map((debt) => debt.toUserId)
      .sort();

  /**
   * Compares the two reads for everybody in a group.
   *
   * @param groupId - The group.
   * @param currency - The currency.
   */
  const expectSameForEveryone = async (groupId: string, currency: string) => {
    for (const member of MEMBERS) {
      expect((await balances.peopleOwedInGroup(member, groupId, currency)).sort()).toEqual(await fromWholeLedger(member, groupId, currency));
    }
  };

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    process.env.DATABASE_URL = TEST_URL;
    const dbModule = await import("@/server/common/db/db");
    await dbModule.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    balances = await import("./balance.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
       SELECT id, id || '@example.com', id, '#c73e2e', now(), 'google-' || id FROM unnest($1::text[]) AS person(id)`,
      [MEMBERS],
    );
    for (const groupId of [HISTORY, LOOP]) {
      await database.query(`INSERT INTO groups (id, name, currency, created_by) VALUES ($1, $1, 'USD', $2)`, [groupId, MEMBERS[0]]);
      await database.query(
        `INSERT INTO group_members (group_id, user_id, role) SELECT $1, member, 'member' FROM unnest($2::text[]) AS member`,
        [groupId, MEMBERS],
      );
    }

    const random = randomFrom(20261031);
    for (let index = 0; index < 240; index += 1) {
      const payerCount = 1 + random(2);
      const payers = [...MEMBERS].sort(() => random(3) - 1).slice(0, payerCount);
      const owers = [...MEMBERS].sort(() => random(3) - 1).slice(0, 2 + random(4));
      const owerCents: [string, number][] = owers.map((userId) => [userId, 100 + random(5000)]);
      const total = owerCents.reduce((running, [, cents]) => running + cents, 0);
      const paid: [string, number][] = payerCount === 1
        ? [[payers[0], total]]
        : [[payers[0], Math.floor(total / 3)], [payers[1], total - Math.floor(total / 3)]];
      await addExpense({
        id: `history-${index}`,
        groupId: HISTORY,
        currency: index % 5 === 0 ? "EUR" : "USD",
        payers: paid,
        owers: owerCents,
        deleted: index % 11 === 0,
      });
      if (index % 7 === 0) {
        const from = MEMBERS[random(MEMBERS.length)];
        const recipient = MEMBERS.find((member) => member !== from && random(2) === 0) ?? MEMBERS.find((member) => member !== from)!;
        await addPayment({ id: `payment-${index}`, groupId: HISTORY, currency: "USD", from, to: recipient, cents: 100 + random(3000) });
      }
    }

    // Ana owes Ben, Ben owes Cara, Cara owes Ana, the same each way.
    await addExpense({ id: "loop-1", groupId: LOOP, currency: "USD", payers: [[MEMBERS[1], 1000]], owers: [[MEMBERS[0], 1000]] });
    await addExpense({ id: "loop-2", groupId: LOOP, currency: "USD", payers: [[MEMBERS[2], 1000]], owers: [[MEMBERS[1], 1000]] });
    await addExpense({ id: "loop-3", groupId: LOOP, currency: "USD", payers: [[MEMBERS[0], 1000]], owers: [[MEMBERS[2], 1000]] });
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it.each(["USD", "EUR"])("agrees with the whole ledger when the group pays person to person, in %s", async (currency) => {
    await database.query(`UPDATE groups SET simplify_debts = false WHERE id = $1`, [HISTORY]);

    await expectSameForEveryone(HISTORY, currency);
  });

  it.each(["USD", "EUR"])("agrees with the whole ledger when the group simplifies its debts, in %s", async (currency) => {
    await database.query(`UPDATE groups SET simplify_debts = true WHERE id = $1`, [HISTORY]);

    await expectSameForEveryone(HISTORY, currency);
  });

  it("finds somebody owing somebody in the history, so these comparisons are about something", async () => {
    await database.query(`UPDATE groups SET simplify_debts = false WHERE id = $1`, [HISTORY]);
    const owed = await Promise.all(MEMBERS.map((member) => balances.peopleOwedInGroup(member, HISTORY, "USD")));

    expect(owed.flat().length).toBeGreaterThan(2);
  });

  it("says nobody owes anybody around a loop that cancels out", async () => {
    await database.query(`UPDATE groups SET simplify_debts = false WHERE id = $1`, [LOOP]);

    expect(await balances.peopleOwedInGroup(MEMBERS[0], LOOP, "USD")).toEqual([]);
    await expectSameForEveryone(LOOP, "USD");
  });

  it("says nothing of a currency the group holds nothing in", async () => {
    expect(await balances.peopleOwedInGroup(MEMBERS[0], HISTORY, "GBP")).toEqual([]);
  });
});

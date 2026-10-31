/**
 * Integration test for who is sent a person's payment methods, against a
 * real Postgres.
 *
 * The rule is "only someone who owes them, right now", and "owes" is decided
 * by the same settle positions the settlement write uses. Mocks can check
 * the branch; only the real ledger can check that the positions it is fed
 * are the right ones as expenses and payments move the balance around: a
 * debt inside one group while the net points the other way, and a debt that
 * a payment has just cleared.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_payee_methods_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const PAYER = "payer-1";
const PAYEE = "payee-1";
const STRANGER = "stranger-1";

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
 * Inserts an expense one person paid in full, with the given shares owed.
 *
 * @param database - Connected client on the test database.
 * @param expense - The expense: id, group (null for one-off), who paid, the total, and each person's share.
 */
async function insertExpense(
  database: Client,
  expense: {
    id: string;
    groupId: string | null;
    paidBy: string;
    amountCents: number;
    shares: [string, number][];
  },
): Promise<void> {
  await database.query(
    `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ($1, $2, $1, $3, 'USD', '2026-10-01', 'exact', $4)`,
    [expense.id, expense.groupId, expense.amountCents, expense.paidBy],
  );
  await database.query(
    `INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ($1, $2, $3)`,
    [expense.id, expense.paidBy, expense.amountCents],
  );
  for (const [userId, owedCents] of expense.shares) {
    await database.query(
      `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ($1, $2, $3)`,
      [expense.id, userId, owedCents],
    );
  }
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("payee methods on the friend ledger, against Postgres", () => {
  let database: Client;
  let getFriendLedger: typeof import("./balance.usecase").getFriendLedger;
  let recordSettlement: typeof import("./expense.usecase").recordSettlement;
  let sendReminder: typeof import("@/server/social/usecase/social.usecase").sendReminder;
  let closePool: () => Promise<void>;

  /**
   * Reads whose-methods-does-the-caller-see as method names.
   *
   * @param callerId - Who is opening the ledger.
   * @param friendId - Whose ledger with the caller it is.
   * @returns The names of the friend's methods the caller was sent.
   */
  async function seenBy(callerId: string, friendId: string): Promise<string[]> {
    return (await getFriendLedger(callerId, friendId)).payeeMethods.map((method) => method.name);
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    // Set before importing db.ts, which reads DATABASE_URL when it first
    // builds the pool.
    process.env.DATABASE_URL = TEST_URL;
    const dbModule = await import("@/server/common/db/db");
    await dbModule.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({ getFriendLedger } = await import("./balance.usecase"));
    ({ recordSettlement } = await import("./expense.usecase"));
    ({ sendReminder } = await import("@/server/social/usecase/social.usecase"));
    const paymentMethods = await import("@/server/payment/usecase/paymentMethod.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub) VALUES
         ($1, 'payer@example.com', 'Pia Payer', '#c73e2e', now(), 'google-payer'),
         ($2, 'payee@example.com', 'Rahim Payee', '#0f8a5f', now(), 'google-payee'),
         ($3, 'stranger@example.com', 'Sam Stranger', '#b45309', now(), 'google-stranger')`,
      [PAYER, PAYEE, STRANGER],
    );
    // Friends, so the ledger opens even while nothing is owed.
    await database.query(
      `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1)`,
      [PAYER, PAYEE],
    );
    await database.query(`INSERT INTO groups (id, name, created_by) VALUES ('grp-1', 'Trip', $1)`, [
      PAYEE,
    ]);
    await database.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES
         ('grp-1', $1, 'member'), ('grp-1', $2, 'owner')`,
      [PAYER, PAYEE],
    );

    await paymentMethods.createPaymentMethod(PAYEE, {
      name: "Chase checking",
      currency: "USD",
      preset: "",
      details: [
        { kind: "account_name", label: "", value: "Rahim Payee" },
        { kind: "account_number", label: "", value: "000123454821" },
      ],
      note: "",
      preferred: false,
    });
    await paymentMethods.createPaymentMethod(PAYEE, {
      name: "bKash",
      currency: "BDT",
      preset: "",
      details: [{ kind: "phone", label: "", value: "+8801712345678" }],
      note: "Use Send Money, not Payment",
      preferred: true,
    });
    await paymentMethods.createPaymentMethod(PAYER, {
      name: "Zelle",
      currency: "USD",
      preset: "zelle",
      details: [{ kind: "email", label: "", value: "pia@example.com" }],
      note: "",
      preferred: true,
    });
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("sends nothing between friends who owe each other nothing", async () => {
    expect(await seenBy(PAYER, PAYEE)).toEqual([]);
    expect(await seenBy(PAYEE, PAYER)).toEqual([]);
  });

  it("sends the payee's methods to the person who owes, and not the other way", async () => {
    // Rahim paid 100.00 for the trip; Pia owes him her half inside the group.
    await insertExpense(database, {
      id: "exp-trip",
      groupId: "grp-1",
      paidBy: PAYEE,
      amountCents: 10000,
      shares: [
        [PAYER, 5000],
        [PAYEE, 5000],
      ],
    });

    const ledger = await getFriendLedger(PAYER, PAYEE);
    // Every method, whatever its currency, oldest first, with full details.
    expect(ledger.payeeMethods).toMatchObject([
      {
        name: "Chase checking",
        currency: "USD",
        preferred: false,
        details: [
          { kind: "account_name", label: "", value: "Rahim Payee" },
          { kind: "account_number", label: "", value: "000123454821" },
        ],
      },
      {
        name: "bKash",
        currency: "BDT",
        preferred: true,
        note: "Use Send Money, not Payment",
        details: [{ kind: "phone", label: "", value: "+8801712345678" }],
      },
    ]);
    // Rahim is owed, not owing: he has no payment to make and is sent nothing.
    expect(await seenBy(PAYEE, PAYER)).toEqual([]);
    // And the methods are nowhere on the user object any more.
    expect(ledger.friend.paymentHandles).toEqual([]);
  });

  it("counts a debt inside one scope even when the net points the other way", async () => {
    // Pia paid 80.00 for Rahim outside the group. Net, Rahim now owes Pia
    // 30.00, but Pia still owes 50.00 in the group and can settle that alone.
    await insertExpense(database, {
      id: "exp-oneoff",
      groupId: null,
      paidBy: PAYER,
      amountCents: 8000,
      shares: [[PAYEE, 8000]],
    });

    const ledger = await getFriendLedger(PAYER, PAYEE);
    expect(ledger.settlePositions).toMatchObject([{ currency: "USD", netCents: 3000 }]);
    expect(ledger.payeeMethods.map((method) => method.name)).toEqual(["Chase checking", "bKash"]);
    // Rahim owes on the net, so he is sent Pia's.
    expect(await seenBy(PAYEE, PAYER)).toEqual(["Zelle"]);
  });

  it("stops sending them once the debt is paid", async () => {
    await recordSettlement(PAYER, {
      groupId: "grp-1",
      toUserId: PAYEE,
      amountCents: 5000,
      currency: "USD",
      method: "bank",
      note: "",
    });

    // Pia owes nothing anywhere now; Rahim still owes her the 80.00.
    expect(await seenBy(PAYER, PAYEE)).toEqual([]);
    expect(await seenBy(PAYEE, PAYER)).toEqual(["Zelle"]);
  });

  it("gives a stranger no ledger at all, so no methods either", async () => {
    await expect(getFriendLedger(STRANGER, PAYEE)).rejects.toMatchObject({ code: "not_found" });
  });

  it("names the method in a reminder and keeps the identifier out of the stored row", async () => {
    await sendReminder(PAYER, PAYEE);

    const { rows } = await database.query(
      `SELECT body FROM notifications WHERE user_id = $1 AND type = 'reminder'`,
      [PAYEE],
    );
    expect(rows).toEqual([{ body: "Reminded you: you owe $80.00 · Pia prefers Zelle." }]);
    expect(rows[0].body).not.toContain("pia@example.com");
  });
});

/**
 * Integration test for the name a settlement keeps of the payment method it
 * was made with, against a real Postgres.
 *
 * A payment can name one of the recipient's own payment methods. The row
 * then takes that method's settlement key and a copy of its name, so the
 * history says "via bKash" and goes on saying it after the method is
 * renamed or removed. The rule that matters most is the one a mock cannot
 * show: naming a method that is not the recipient's, or one that is gone,
 * must never stop the payment from being recorded.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_method_label_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const PAYER = "payer-1";
const PAYEE = "payee-1";

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

const reachable = await databaseReachable();

describe.skipIf(!reachable)("the payment method kept on a settlement, against Postgres", () => {
  let database: Client;
  let recordSettlement: typeof import("./expense.usecase").recordSettlement;
  let getFriendLedger: typeof import("./balance.usecase").getFriendLedger;
  let paymentMethods: typeof import("@/server/payment/usecase/paymentMethod.usecase");
  let closePool: () => Promise<void>;
  /** Ids of the payee's methods, by name. */
  const payeeMethod: Record<string, string> = {};
  let payerZelleId = "";

  /**
   * Records a plain payment from the payer to the payee.
   *
   * @param amountCents - The amount paid.
   * @param extra - Fields to add or override on the request.
   * @returns The settlement in proto shape.
   */
  const payRahim = (amountCents: number, extra: Record<string, unknown> = {}) =>
    recordSettlement(PAYER, {
      groupId: "",
      toUserId: PAYEE,
      amountCents,
      currency: "USD",
      method: "cash",
      note: "",
      ...extra,
    });

  /**
   * Reads what a settlement row stores about how it was paid.
   *
   * @param settlementId - The settlement to read.
   * @returns Its method key and the name kept with it.
   */
  const stored = async (settlementId: string) =>
    (
      await database.query(`SELECT method, method_label FROM settlements WHERE id = $1`, [
        settlementId,
      ])
    ).rows[0];

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
    ({ getFriendLedger } = await import("./balance.usecase"));
    paymentMethods = await import("@/server/payment/usecase/paymentMethod.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub) VALUES
         ($1, 'payer@example.com', 'Pia Payer', '#c73e2e', now(), 'google-payer'),
         ($2, 'payee@example.com', 'Rahim Payee', '#0f8a5f', now(), 'google-payee')`,
      [PAYER, PAYEE],
    );
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
    // Outside groups Pia owes Rahim 300.00; inside the trip Rahim owes Pia
    // 40.00. Net, Pia owes 260.00, with something pointing each way.
    await database.query(
      `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by) VALUES
         ('exp-direct', NULL, 'Rent', 30000, 'USD', '2026-10-01', 'exact', $2),
         ('exp-trip', 'grp-1', 'Fuel', 4000, 'USD', '2026-10-02', 'exact', $1)`,
      [PAYER, PAYEE],
    );
    await database.query(
      `INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES
         ('exp-direct', $2, 30000), ('exp-trip', $1, 4000)`,
      [PAYER, PAYEE],
    );
    await database.query(
      `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES
         ('exp-direct', $1, 30000), ('exp-trip', $2, 4000)`,
      [PAYER, PAYEE],
    );

    const methodInputs = [
      {
        name: "Chase checking",
        currency: "USD",
        preset: "",
        details: [{ kind: "account_number", label: "", value: "000123454821" }],
      },
      {
        name: "Venmo",
        currency: "USD",
        preset: "venmo",
        details: [{ kind: "username", label: "", value: "rahim-payee" }],
      },
      {
        name: "bKash",
        currency: "BDT",
        preset: "",
        details: [{ kind: "phone", label: "", value: "+8801712345678" }],
      },
      {
        name: "Old wallet",
        currency: "USD",
        preset: "",
        details: [{ kind: "username", label: "", value: "rahim-old" }],
      },
    ];
    for (const input of methodInputs) {
      const created = await paymentMethods.createPaymentMethod(PAYEE, {
        ...input,
        note: "",
        preferred: false,
      });
      payeeMethod[input.name] = created.id;
    }
    payerZelleId = (
      await paymentMethods.createPaymentMethod(PAYER, {
        name: "Zelle",
        currency: "USD",
        preset: "zelle",
        details: [{ kind: "email", label: "", value: "pia@example.com" }],
        note: "",
        preferred: false,
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("records a bank method under the bank key with its name", async () => {
    const settlement = await payRahim(1000, { paymentMethodId: payeeMethod["Chase checking"] });

    expect(settlement).toMatchObject({ method: "bank", methodLabel: "Chase checking" });
    expect(await stored(settlement.id)).toEqual({ method: "bank", method_label: "Chase checking" });
  });

  it("lets the method named outrank the plain method key sent with it", async () => {
    // The client sent "cash" alongside the id; the method is what was used.
    const settlement = await payRahim(1000, { method: "cash", paymentMethodId: payeeMethod.Venmo });

    expect(await stored(settlement.id)).toEqual({ method: "venmo", method_label: "Venmo" });
  });

  it("records a wallet as other, and its name is what tells it apart", async () => {
    const settlement = await payRahim(1000, { paymentMethodId: payeeMethod.bKash });

    expect(await stored(settlement.id)).toEqual({ method: "other", method_label: "bKash" });
  });

  it("says how the money moved in both people's history", async () => {
    const payerSide = (await getFriendLedger(PAYER, PAYEE)).entries
      .filter((entry) => entry.kind === "settlement")
      .map((entry) => entry.description);
    const payeeSide = (await getFriendLedger(PAYEE, PAYER)).entries
      .filter((entry) => entry.kind === "settlement")
      .map((entry) => entry.description);

    expect(payerSide.sort()).toEqual([
      "You paid via Chase checking",
      "You paid via Venmo",
      "You paid via bKash",
    ]);
    expect(payeeSide.sort()).toEqual([
      "Pia Payer paid you via Chase checking",
      "Pia Payer paid you via Venmo",
      "Pia Payer paid you via bKash",
    ]);
  });

  it("still records a payment that names a method which is not the recipient's", async () => {
    // Pia's own Zelle is not where Rahim is paid. The payment happened all
    // the same: it is recorded from the plain key, with no name.
    const settlement = await payRahim(1000, { method: "cash", paymentMethodId: payerZelleId });

    expect(await stored(settlement.id)).toEqual({ method: "cash", method_label: "" });
  });

  it("still records a payment that names a method removed since the dialog opened", async () => {
    await paymentMethods.deletePaymentMethod(PAYEE, payeeMethod["Old wallet"]!);

    const settlement = await payRahim(1000, {
      method: "other",
      paymentMethodId: payeeMethod["Old wallet"],
    });

    expect(await stored(settlement.id)).toEqual({ method: "other", method_label: "" });
  });

  it("does not look a named method up for someone the debt check turns away", async () => {
    const repo = await import("@/server/payment/repo/paymentMethods.repo");
    const lookedUp = vi.spyOn(repo, "findPaymentMethod");
    try {
      // Rahim owes Pia nothing outside groups, so "Rahim pays Pia" is refused.
      // Naming one of Pia's methods must not get it read on the way there.
      await expect(
        recordSettlement(PAYEE, {
          groupId: "",
          toUserId: PAYER,
          amountCents: 500,
          currency: "USD",
          method: "cash",
          note: "",
          scopeGroupIds: [""],
          paymentMethodId: payerZelleId,
        }),
      ).rejects.toMatchObject({ code: "invalid_argument" });
      expect(lookedUp).not.toHaveBeenCalled();

      // The same call from someone who does owe reads it, inside the write.
      await payRahim(500, { paymentMethodId: payeeMethod["Chase checking"] });
      expect(lookedUp).toHaveBeenCalledTimes(1);
      expect(lookedUp.mock.calls[0]?.slice(0, 2)).toEqual([payeeMethod["Chase checking"], PAYEE]);
      expect(lookedUp.mock.calls[0]?.[2]).toBeDefined();
    } finally {
      lookedUp.mockRestore();
    }
  });

  it("keeps a plain payment exactly as before", async () => {
    const settlement = await payRahim(1000, { method: "zelle" });

    expect(settlement).toMatchObject({ method: "zelle", methodLabel: "" });
    const history = (await getFriendLedger(PAYER, PAYEE)).entries
      .filter((entry) => entry.id === settlement.id)
      .map((entry) => entry.description);
    expect(history).toEqual(["You paid"]);
  });

  it("resolves the caller's own method when they record money received", async () => {
    // Rahim logs that Pia paid him; the method is his, the recipient's.
    const settlement = await recordSettlement(PAYEE, {
      groupId: "",
      toUserId: PAYER,
      amountCents: 1000,
      currency: "USD",
      method: "cash",
      note: "",
      received: true,
      paymentMethodId: payeeMethod["Chase checking"],
    });

    expect(await stored(settlement.id)).toEqual({ method: "bank", method_label: "Chase checking" });
  });

  it("keeps the name it was paid under after the method is renamed or removed", async () => {
    const settlement = await payRahim(1000, { paymentMethodId: payeeMethod.bKash });
    await paymentMethods.updatePaymentMethod(PAYEE, {
      id: payeeMethod.bKash!,
      name: "bKash personal",
      currency: "BDT",
      details: [{ kind: "phone", label: "", value: "+8801712345678" }],
      note: "",
      preferred: false,
    });
    expect((await stored(settlement.id)).method_label).toBe("bKash");

    await paymentMethods.deletePaymentMethod(PAYEE, payeeMethod.bKash!);
    expect((await stored(settlement.id)).method_label).toBe("bKash");
  });

  it("puts the name on the cash row of a net settlement and on none of its cancelling rows", async () => {
    const position = (await getFriendLedger(PAYER, PAYEE)).settlePositions.find(
      (candidate) => candidate.currency === "USD",
    )!;
    // Pia owes on the net, with the trip pointing the other way.
    expect(position.netCents).toBeLessThan(0);

    await recordSettlement(PAYER, {
      groupId: "",
      toUserId: PAYEE,
      amountCents: -position.netCents,
      currency: "USD",
      method: "cash",
      note: "",
      netAcrossScopes: true,
      positionDigest: position.digest,
      paymentMethodId: payeeMethod["Chase checking"],
    });

    const { rows } = await database.query(
      `SELECT method, method_label, COUNT(*)::int AS total
         FROM settlements WHERE net_settlement_id IS NOT NULL
        GROUP BY method, method_label ORDER BY method`,
    );
    expect(rows).toEqual([
      { method: "bank", method_label: "Chase checking", total: 1 },
      // An offset moved no money by any method, so it carries no name.
      { method: "offset", method_label: "", total: 2 },
    ]);
    const after = (await getFriendLedger(PAYER, PAYEE)).settlePositions.find(
      (candidate) => candidate.currency === "USD",
    );
    expect(after).toBeUndefined();
  });

  it("has the schema bound the name like any other persisted text", async () => {
    await expect(
      database.query(
        `INSERT INTO settlements (id, from_user, to_user, amount_cents, currency, method, note, recorded_by, method_label)
         VALUES ('raw-1', $1, $2, 100, 'USD', 'other', '', $1, $3)`,
        [PAYER, PAYEE, "x".repeat(41)],
      ),
    ).rejects.toMatchObject({ constraint: "chk_settlements_method_label" });
  });
});

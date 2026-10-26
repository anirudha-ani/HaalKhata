/**
 * Real PostgreSQL regression for audit A07: somebody can leave a group only
 * when their balance there is zero, and nothing can settle with them once
 * they have gone. So removing a payment or changing an expense must not move
 * a former member's balance in that group, or it leaves a debt nobody can
 * clear. Changes that leave them at zero, and anything between people who are
 * still members, carry on as before.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreateExpenseRequest } from "@haalkhata/protogen/expense/v1/expense_pb";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_former_member_balance_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const RAHIM = "former-rahim";
const SARA = "former-sara";
const TOMAS = "former-tomas";

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

describe.skipIf(!reachable)("changes that would move a former member's group balance", () => {
  let database: Client;
  let groupId: string;
  let createExpense: typeof import("./expense.usecase").createExpense;
  let updateExpense: typeof import("./expense.usecase").updateExpense;
  let deleteExpense: typeof import("./expense.usecase").deleteExpense;
  let deleteSettlement: typeof import("./expense.usecase").deleteSettlement;
  let removeMemberFromGroup: typeof import("@/server/group/usecase/group.usecase").removeMemberFromGroup;
  let closePool: () => Promise<void>;

  /**
   * A group dinner Tomas paid for and the three shared.
   *
   * @param tomasPaysCents - What Tomas paid; the rest is paid by Sara.
   * @returns An even three-way split of 30.00 with a fresh operation id.
   */
  function dinnerRequest(tomasPaysCents: number): CreateExpenseRequest {
    const payers = [{ userId: TOMAS, amountCents: tomasPaysCents }];
    if (tomasPaysCents < 3000) payers.push({ userId: SARA, amountCents: 3000 - tomasPaysCents });
    return {
      groupId, description: "Dinner", amountCents: 3000, currency: "USD",
      category: "food", expenseDate: "2026-10-20", splitType: "exact", notes: "",
      payers,
      splitSpecs: [RAHIM, SARA, TOMAS].map((userId) => ({ userId, amountCents: 1000, percentBp: 0, shares: 0 })),
      items: [], taxCents: 0, tipCents: 0, operationId: randomUUID(),
    } as unknown as CreateExpenseRequest;
  }

  /**
   * Records a group payment directly, as an earlier settle-up left it.
   *
   * @param fromUser - Who paid.
   * @param toUser - Who was paid.
   * @param amountCents - How much.
   * @returns The payment's id.
   */
  async function payment(fromUser: string, toUser: string, amountCents: number): Promise<string> {
    const settlementId = randomUUID();
    await database.query(
      `INSERT INTO settlements (id, group_id, from_user, to_user, amount_cents, currency, method, recorded_by)
       VALUES ($1, $2, $3, $4, $5, 'USD', 'cash', $3)`,
      [settlementId, groupId, fromUser, toUser, amountCents],
    );
    return settlementId;
  }

  /** @returns Whether the payment still counts. */
  async function paymentStands(settlementId: string): Promise<boolean> {
    const { rows } = await database.query("SELECT deleted_at FROM settlements WHERE id = $1", [settlementId]);
    return rows[0].deleted_at === null;
  }

  /** @returns The expense's description and whether it still counts. */
  async function expenseState(expenseId: string) {
    const { rows } = await database.query(
      "SELECT description, deleted_at IS NULL AS stands FROM expenses WHERE id = $1",
      [expenseId],
    );
    return rows[0];
  }

  const leftGroup = { code: "failed_precondition", message: expect.stringContaining("Tomas has left this group") };

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
    ({ createExpense, updateExpense, deleteExpense, deleteSettlement } = await import("./expense.usecase"));
    ({ removeMemberFromGroup } = await import("@/server/group/usecase/group.usecase"));
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, google_sub) VALUES
       ($1, 'former-rahim@example.com', 'Rahim', '#336699', 'google-former-rahim'),
       ($2, 'former-sara@example.com', 'Sara', '#336699', 'google-former-sara'),
       ($3, 'former-tomas@example.com', 'Tomas', '#336699', 'google-former-tomas')`,
      [RAHIM, SARA, TOMAS],
    );
  }, 60_000);

  beforeEach(async () => {
    await database.query("TRUNCATE groups, expenses, settlements, activity, notifications, operations CASCADE");
    groupId = randomUUID();
    await database.query("INSERT INTO groups (id, name, created_by) VALUES ($1, 'Goa Trip', $2)", [groupId, RAHIM]);
    await database.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')",
      [groupId, RAHIM, SARA, TOMAS],
    );
  });

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  /**
   * Tomas pays for dinner, both others pay him back, and he leaves at zero.
   * @returns The dinner and the two repayments.
   */
  async function tomasSettlesAndLeaves() {
    const dinner = await createExpense(SARA, dinnerRequest(3000));
    const fromRahim = await payment(RAHIM, TOMAS, 1000);
    const fromSara = await payment(SARA, TOMAS, 1000);
    await removeMemberFromGroup(TOMAS, { groupId, userId: TOMAS });
    return { dinner, fromRahim, fromSara };
  }

  it("refuses the former member removing a payment they were part of", async () => {
    const { fromRahim } = await tomasSettlesAndLeaves();

    await expect(deleteSettlement(TOMAS, fromRahim)).rejects.toMatchObject(leftGroup);
    expect(await paymentStands(fromRahim)).toBe(true);
  });

  it("refuses the member who stayed removing that payment too", async () => {
    const { fromRahim } = await tomasSettlesAndLeaves();

    await expect(deleteSettlement(RAHIM, fromRahim)).rejects.toMatchObject(leftGroup);
    expect(await paymentStands(fromRahim)).toBe(true);
  });

  it("refuses deleting an expense that would put the former member back into debt or credit", async () => {
    const { dinner } = await tomasSettlesAndLeaves();

    await expect(deleteExpense(SARA, dinner.id)).rejects.toMatchObject(leftGroup);
    expect(await expenseState(dinner.id)).toEqual({ description: "Dinner", stands: true });
  });

  it("refuses editing that expense in a way that drops the former member's share", async () => {
    const { dinner } = await tomasSettlesAndLeaves();
    const withoutTomas = {
      ...dinnerRequest(0),
      payers: [{ userId: SARA, amountCents: 3000 }],
      splitSpecs: [RAHIM, SARA].map((userId) => ({ userId, amountCents: 1500, percentBp: 0, shares: 0 })),
    } as unknown as CreateExpenseRequest;

    await expect(updateExpense(SARA, dinner.id, withoutTomas)).rejects.toMatchObject(leftGroup);
    expect(await expenseState(dinner.id)).toEqual({ description: "Dinner", stands: true });
  });

  it("still deletes an expense the former member had no balance on", async () => {
    // Tomas paid exactly his own share: deleting it leaves him at zero.
    const ownShare = await createExpense(SARA, {
      ...dinnerRequest(1000),
      description: "Tomas's own ticket",
      amountCents: 1000,
      payers: [{ userId: TOMAS, amountCents: 1000 }],
      splitSpecs: [{ userId: TOMAS, amountCents: 1000, percentBp: 0, shares: 0 }],
    } as unknown as CreateExpenseRequest);
    await removeMemberFromGroup(TOMAS, { groupId, userId: TOMAS });

    await deleteExpense(SARA, ownShare.id);

    expect(await expenseState(ownShare.id)).toEqual({ description: "Tomas's own ticket", stands: false });
  });

  it("still removes a payment between two people who are both still members", async () => {
    const between = await payment(RAHIM, SARA, 500);

    await deleteSettlement(SARA, between);

    expect(await paymentStands(between)).toBe(false);
  });
});

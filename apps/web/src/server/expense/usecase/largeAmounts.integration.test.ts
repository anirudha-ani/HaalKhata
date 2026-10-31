/**
 * Real PostgreSQL regression: money past the old 32-bit ceiling. A rupiah
 * deposit of 25 billion is recorded and shown to the cent; two expenses at
 * the per-amount ceiling add up into one exact balance that reaches the
 * wire as a 64-bit integer; one amount past the ceiling is refused by the
 * usecase and by the database; and nobody's expenses in one currency can
 * add up past what a JavaScript number counts exactly.
 */

import { randomUUID } from "node:crypto";
import { create, toJson } from "@bufbuild/protobuf";
import { OverallBalancesResponseSchema } from "@haalkhata/protogen/expense/v1/expense_pb";
import { wireIntegers } from "@haalkhata/shared/api/wireNumbers";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";
import { formatMoney } from "@haalkhata/shared/money/money";
import { MAX_MONEY_CENTS, MAX_PERSON_VOLUME_CENTS } from "@/server/expense/expense.constants";
import type { ExpenseInput } from "./expense.usecase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_large_amounts_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const PAYER = "large-pat";
const SHARER = "large-sam";
const RUPIAH_GROUP = "large-rupiah";
const DOLLAR_GROUP = "large-dollar";
const YEN_GROUP = "large-yen";
/** Rp 25,000,000,000.00: past 21,474,836.47, where 32-bit money stopped. */
const DEPOSIT_CENTS = 2_500_000_000_000;
/** Expenses at the ceiling the yen group starts with, all on Sam. */
const SEEDED_YEN_EXPENSES = 99;

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

/**
 * An expense Pat pays in full, split evenly between the people named.
 *
 * @param groupId - The group it is in.
 * @param currency - Its currency.
 * @param amountCents - Its total.
 * @param sharers - Who owes a share.
 * @returns A create request with a fresh operation id.
 */
function patPays(groupId: string, currency: string, amountCents: number, sharers: string[]): ExpenseInput {
  return {
    groupId, description: "Deposit", amountCents, currency,
    category: "general", expenseDate: "2026-10-27", splitType: "equal", notes: "",
    payers: [{ userId: PAYER, amountCents }],
    splitSpecs: sharers.map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })),
    items: [], taxCents: 0, tipCents: 0, operationId: randomUUID(),
  } as unknown as ExpenseInput;
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("money past the old 32-bit ceiling, against Postgres", () => {
  let database: Client;
  let usecase: typeof import("./expense.usecase");
  let balances: typeof import("./balance.usecase");
  let groups: typeof import("@/server/group/usecase/group.usecase");
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
    const dbModule = await import("@/server/common/db/db");
    await dbModule.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    usecase = await import("./expense.usecase");
    balances = await import("./balance.usecase");
    groups = await import("@/server/group/usecase/group.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub, default_currency) VALUES
         ($1, 'pat@example.com', 'Pat Payer', '#c73e2e', now(), 'google-large-pat', 'USD'),
         ($2, 'sam@example.com', 'Sam Sharer', '#0f8a5f', now(), 'google-large-sam', 'USD')`,
      [PAYER, SHARER],
    );
    for (const [groupId, currency] of [[RUPIAH_GROUP, "IDR"], [DOLLAR_GROUP, "USD"], [YEN_GROUP, "JPY"]]) {
      await database.query(`INSERT INTO groups (id, name, created_by, currency) VALUES ($1, $1, $2, $3)`, [groupId, PAYER, currency]);
      await database.query(
        `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
        [groupId, PAYER, SHARER],
      );
    }
    // Sam's own yen expenses, each at the ceiling: 990 trillion of the
    // 1,000 trillion one person's expenses may add up to.
    await database.query(
      `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
         SELECT 'yen-' || number, $1, 'Yen', $2, 'JPY', '2026-10-01', 'equal', $3 FROM generate_series(1, $4) AS number`,
      [YEN_GROUP, MAX_MONEY_CENTS, SHARER, SEEDED_YEN_EXPENSES],
    );
    await database.query(
      `INSERT INTO expense_payers (expense_id, user_id, amount_cents)
         SELECT 'yen-' || number, $1, $2 FROM generate_series(1, $3) AS number`,
      [SHARER, MAX_MONEY_CENTS, SEEDED_YEN_EXPENSES],
    );
    await database.query(
      `INSERT INTO expense_splits (expense_id, user_id, owed_cents)
         SELECT 'yen-' || number, $1, $2 FROM generate_series(1, $3) AS number`,
      [SHARER, MAX_MONEY_CENTS, SEEDED_YEN_EXPENSES],
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

  it("records a 25 billion rupiah deposit and shows each half to the cent", async () => {
    const deposit = await usecase.createExpense(PAYER, patPays(RUPIAH_GROUP, "IDR", DEPOSIT_CENTS, [PAYER, SHARER]));

    expect(deposit.amountCents).toBe(DEPOSIT_CENTS);
    expect(deposit.splits.map((split) => split.owedCents)).toEqual([DEPOSIT_CENTS / 2, DEPOSIT_CENTS / 2]);
    const { rows } = await database.query("SELECT pg_typeof(amount_cents)::text AS kind FROM expenses WHERE id = $1", [deposit.id]);
    expect(rows[0].kind).toBe("bigint");
    const group = await balances.getGroupBalances(SHARER, RUPIAH_GROUP);
    expect(group.nets).toEqual(
      expect.arrayContaining([
        { userId: SHARER, netCents: -DEPOSIT_CENTS / 2 },
        { userId: PAYER, netCents: DEPOSIT_CENTS / 2 },
      ]),
    );
  });

  it("adds two expenses at the ceiling into one exact balance, sent as a 64-bit integer", async () => {
    await usecase.createExpense(PAYER, patPays(DOLLAR_GROUP, "USD", MAX_MONEY_CENTS, [SHARER]));
    await usecase.createExpense(PAYER, patPays(DOLLAR_GROUP, "USD", MAX_MONEY_CENTS, [SHARER]));

    const overall = await balances.getOverallBalances(SHARER);
    const listed = await groups.listGroups(SHARER);

    expect(overall.youOweCents).toBe(2 * MAX_MONEY_CENTS);
    expect(listed.find((entry) => entry.group.id === DOLLAR_GROUP)?.yourNetCents).toBe(-2 * MAX_MONEY_CENTS);
    const json = toJson(
      OverallBalancesResponseSchema,
      create(OverallBalancesResponseSchema, wireIntegers(OverallBalancesResponseSchema, overall as never)),
    ) as { youOweCents: string };
    expect(json.youOweCents).toBe("20000000000000");
  });

  it("refuses one amount past the ceiling, and so does the database", async () => {
    await expect(usecase.createExpense(PAYER, patPays(DOLLAR_GROUP, "USD", MAX_MONEY_CENTS + 1, [SHARER]))).rejects.toMatchObject({
      code: "invalid_argument",
      // Written the way the screens write money: $100,000,000,000.00 in en-US.
      message: `amount is too large (the most one amount can be is ${formatMoney(MAX_MONEY_CENTS, "USD")})`,
    });
    await expect(
      database.query(
        `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
         VALUES ('too-big', $1, 'Too big', $2, 'USD', '2026-10-01', 'equal', $3)`,
        [DOLLAR_GROUP, MAX_MONEY_CENTS + 1, PAYER],
      ),
    ).rejects.toThrow(/chk_expenses_money_max/);
  });

  it("stops anyone's expenses in one currency at the ceiling, by name, and lets them be corrected down", async () => {
    // Exactly reaches Sam's ceiling: allowed.
    const last = await usecase.createExpense(PAYER, patPays(YEN_GROUP, "JPY", MAX_MONEY_CENTS, [SHARER]));

    // One yen more is refused, to Pat naming Sam and to Sam in their own words.
    await expect(usecase.createExpense(PAYER, patPays(YEN_GROUP, "JPY", 1, [SHARER]))).rejects.toMatchObject({
      code: "failed_precondition",
      message: `This would take the expenses Sam Sharer is on past ${formatMoney(MAX_PERSON_VOLUME_CENTS, "JPY")} in all, more than this app can add up exactly for one person`,
    });
    const samPays = { ...patPays(YEN_GROUP, "JPY", 1, [SHARER]), payers: [{ userId: SHARER, amountCents: 1 }] } as ExpenseInput;
    await expect(usecase.createExpense(SHARER, samPays)).rejects.toMatchObject({
      message: expect.stringMatching(/^This would take the expenses you are on past/),
    });
    // Nobody else is held back: Pat's own yen are nowhere near it.
    await expect(usecase.createExpense(PAYER, patPays(YEN_GROUP, "JPY", MAX_MONEY_CENTS, [PAYER]))).resolves.toMatchObject({
      amountCents: MAX_MONEY_CENTS,
    });

    // Correcting one down is always allowed, and frees room for another.
    const half = MAX_MONEY_CENTS / 2;
    await expect(usecase.updateExpense(PAYER, last.id, patPays(YEN_GROUP, "JPY", half, [SHARER]))).resolves.toMatchObject({
      amountCents: half,
    });
    await usecase.createExpense(PAYER, patPays(YEN_GROUP, "JPY", half, [SHARER]));
    // Back at the ceiling: raising an expense by one yen is refused, and
    // lowering it further still goes through.
    await expect(usecase.updateExpense(PAYER, last.id, patPays(YEN_GROUP, "JPY", half + 1, [SHARER]))).rejects.toMatchObject({
      code: "failed_precondition",
    });
    await expect(usecase.updateExpense(PAYER, last.id, patPays(YEN_GROUP, "JPY", 1, [SHARER]))).resolves.toMatchObject({
      amountCents: 1,
    });
  });
});

/**
 * Real PostgreSQL regression: an expense keeps the currency it was saved
 * in. An edit naming another currency — what an app from before the forms
 * kept it sends, in the editor's own default — is refused and changes
 * nothing, instead of relabelling BDT 5,000 as USD 5,000 or ¥3,500 as
 * $3,500. An edit in the saved currency, or naming none, saves in it, group
 * expenses included.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";
import type { ExpenseInput } from "./expense.usecase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_currency_kept_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const RAHIM = "currency-rahim";
const SARA = "currency-sara";
const TRIP = "currency-trip";

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
 * An expense Rahim paid and split evenly with Sara.
 *
 * @param currency - The currency the request names.
 * @param amountCents - Its total, in that currency's minor units.
 * @param description - What it was.
 * @param groupId - The group it is in; none by default.
 * @returns A create or edit request with a fresh operation id.
 */
function rahimPays(currency: string, amountCents: number, description: string, groupId = ""): ExpenseInput {
  return {
    groupId, description, amountCents, currency,
    category: "general", expenseDate: "2026-10-28", splitType: "equal", notes: "",
    payers: [{ userId: RAHIM, amountCents }],
    splitSpecs: [RAHIM, SARA].map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })),
    items: [], taxCents: 0, tipCents: 0, operationId: randomUUID(),
  } as unknown as ExpenseInput;
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("an expense keeps its currency, against Postgres", () => {
  let database: Client;
  let usecase: typeof import("./expense.usecase");
  let closePool: () => Promise<void>;

  /**
   * An expense as stored.
   *
   * @param expenseId - Which.
   * @returns Its currency, total and description.
   */
  const stored = async (expenseId: string) =>
    (
      await database.query<{ currency: string; amount_cents: number; description: string }>(
        "SELECT currency, amount_cents, description FROM expenses WHERE id = $1",
        [expenseId],
      )
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
    const dbModule = await import("@/server/common/db/db");
    await dbModule.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    usecase = await import("./expense.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub, default_currency) VALUES
         ($1, 'rahim@example.com', 'Rahim Raza', '#c73e2e', now(), 'google-currency-rahim', 'BDT'),
         ($2, 'sara@example.com', 'Sara Silva', '#0f8a5f', now(), 'google-currency-sara', 'USD')`,
      [RAHIM, SARA],
    );
    await database.query("INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1)", [RAHIM, SARA]);
    await database.query("INSERT INTO groups (id, name, created_by, currency) VALUES ($1, 'Trip', $2, 'EUR')", [TRIP, RAHIM]);
    await database.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')",
      [TRIP, RAHIM, SARA],
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

  it("refuses an edit in the editor's own currency and leaves the expense as it was", async () => {
    const deposit = await usecase.createExpense(RAHIM, rahimPays("BDT", 500_000, "Rent deposit"));

    // Sara fixes the description from an app that sends her default currency.
    await expect(usecase.updateExpense(SARA, deposit.id, rahimPays("USD", 500_000, "Rent deposit, May"))).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringMatching(/^This expense is in BDT and its currency can't be changed/),
    });

    expect(await stored(deposit.id)).toEqual({ currency: "BDT", amount_cents: 500_000, description: "Rent deposit" });
  });

  it("refuses amounts typed in another currency's units instead of storing them", async () => {
    const dinner = await usecase.createExpense(RAHIM, rahimPays("JPY", 3_500, "Ramen"));

    // ¥3,500 read by a dollar form comes back as 350000 cents.
    await expect(usecase.updateExpense(SARA, dinner.id, rahimPays("USD", 350_000, "Ramen night"))).rejects.toMatchObject({
      code: "failed_precondition",
    });

    expect(await stored(dinner.id)).toEqual({ currency: "JPY", amount_cents: 3_500, description: "Ramen" });
  });

  it("saves an edit in the saved currency, or naming none, in that currency", async () => {
    const deposit = await usecase.createExpense(RAHIM, rahimPays("BDT", 500_000, "Rent deposit"));

    await usecase.updateExpense(SARA, deposit.id, rahimPays("BDT", 500_000, "Rent deposit, May"));
    expect(await stored(deposit.id)).toEqual({ currency: "BDT", amount_cents: 500_000, description: "Rent deposit, May" });

    // Sara's default is USD; an edit naming no currency still keeps BDT.
    await usecase.updateExpense(SARA, deposit.id, rahimPays("", 400_000, "Rent deposit, June"));
    expect(await stored(deposit.id)).toEqual({ currency: "BDT", amount_cents: 400_000, description: "Rent deposit, June" });
  });

  it("keeps a group expense in its saved currency too, even one older than the group's own", async () => {
    // From before group expenses always took the group's currency.
    const taxi = await usecase.createExpense(RAHIM, rahimPays("EUR", 4_000, "Taxi", TRIP));
    await database.query("UPDATE expenses SET currency = 'GBP' WHERE id = $1", [taxi.id]);

    await usecase.updateExpense(SARA, taxi.id, rahimPays("GBP", 4_000, "Airport taxi", TRIP));
    expect(await stored(taxi.id)).toEqual({ currency: "GBP", amount_cents: 4_000, description: "Airport taxi" });

    await expect(usecase.updateExpense(SARA, taxi.id, rahimPays("EUR", 4_000, "Taxi", TRIP))).rejects.toMatchObject({
      code: "failed_precondition",
    });
  });
});

/**
 * Real PostgreSQL regression for several people editing one expense.
 *
 * An edit used to replace the whole expense, so whoever saved second silently
 * undid the first person's change, and a retry after a lost response announced
 * everything again. The merge's own tests prove the rules; these prove what
 * they promise of the ledger: both people's changes are in the saved rows, a
 * real collision saves nothing, the balance is right afterwards, receipt lines
 * keep their ids, and a retry or an empty edit tells nobody anything.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_expense_edit_merge_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const SARA = "user-sara";
const TOMAS = "user-tomas";
const PRIYA = "user-priya";
const FLAT = "grp-flat";

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

describe.skipIf(!reachable)("several people editing one expense, against Postgres", () => {
  let database: Client;
  let usecase: typeof import("./expense.usecase");
  let balances: typeof import("./balance.usecase");
  let closePool: () => Promise<void>;
  type SavedExpense = Awaited<ReturnType<typeof usecase.createExpense>>;

  /**
   * The bill as a create request: pizza on Tomas, beer on Priya, paid by Sara.
   *
   * @returns The request.
   */
  const dinnerRequest = () => ({
    groupId: FLAT,
    description: "Dinner",
    amountCents: 2800,
    currency: "USD",
    category: "food",
    expenseDate: "2026-10-29",
    splitType: "itemized",
    notes: "",
    payers: [{ userId: SARA, amountCents: 2800 }],
    splitSpecs: [],
    items: [
      { id: "", name: "Pizza", quantity: 1, totalCents: 2000, assignments: [{ userId: TOMAS, weight: 1 }] },
      { id: "", name: "Beer", quantity: 1, totalCents: 800, assignments: [{ userId: PRIYA, weight: 1 }] },
    ],
    taxCents: 0,
    tipCents: 0,
    operationId: randomUUID(),
  }) as never;

  /**
   * What an edit form would send for an expense: the same expense with some
   * fields changed, its lines keeping their ids.
   *
   * @param saved - The expense as the form opened it.
   * @param change - What this person changed.
   * @returns The request.
   */
  const editOf = (saved: SavedExpense, change: Record<string, unknown>) => ({
    groupId: saved.groupId,
    description: saved.description,
    amountCents: saved.amountCents,
    currency: saved.currency,
    category: saved.category,
    expenseDate: saved.expenseDate,
    splitType: saved.splitType,
    notes: saved.notes,
    payers: saved.payers,
    splitSpecs: saved.splits.map((split) => ({ userId: split.userId, amountCents: split.owedCents, percentBp: 0, shares: 0 })),
    items: saved.items,
    taxCents: saved.taxCents,
    tipCents: saved.tipCents,
    operationId: "",
    ...change,
  }) as never;

  /**
   * The saved row and its lines.
   *
   * @param expenseId - The expense.
   * @returns What is stored.
   */
  const stored = async (expenseId: string) => (await usecase.getExpense(SARA, expenseId)).expense!;

  /**
   * How many bell rows and feed rows an expense has produced.
   *
   * @param expenseId - The expense.
   * @returns The two counts.
   */
  const announcements = async (expenseId: string) => {
    const link = `/expenses/${expenseId}`;
    const { rows } = await database.query<{ bell: number; feed: number }>(
      `SELECT (SELECT count(*)::int FROM notifications WHERE link = $1) AS bell,
              (SELECT count(*)::int FROM activity WHERE link = $1) AS feed`,
      [link],
    );
    return rows[0];
  };

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

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
       VALUES ($1, 'sara@example.com', 'Sara', '#c73e2e', now(), 'google-sara'),
              ($2, 'tomas@example.com', 'Tomas', '#0f8a5f', now(), 'google-tomas'),
              ($3, 'priya@example.com', 'Priya', '#1c4fa0', now(), 'google-priya')`,
      [SARA, TOMAS, PRIYA],
    );
    await database.query(`INSERT INTO groups (id, name, currency, created_by) VALUES ($1, 'Flat', 'USD', $2)`, [FLAT, SARA]);
    await database.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`,
      [FLAT, SARA, TOMAS, PRIYA],
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

  let dinner: SavedExpense;

  beforeEach(async () => {
    dinner = await usecase.createExpense(SARA, dinnerRequest());
  });

  it("keeps both people's changes when each changed something different, and lands on the right balance", async () => {
    const [pizza, beer] = dinner.items;

    await usecase.updateExpense(TOMAS, dinner.id, editOf(dinner, {
      amountCents: 2600,
      payers: [{ userId: SARA, amountCents: 2600 }],
      items: [{ ...pizza, totalCents: 1800 }, beer],
    }), false, dinner);
    await usecase.updateExpense(SARA, dinner.id, editOf(dinner, {
      items: [pizza, { ...beer, assignments: [{ userId: SARA, weight: 1 }] }],
    }), false, dinner);

    const saved = await stored(dinner.id);
    expect(saved.items.map((item) => [item.id, item.totalCents, item.assignments.map((entry) => entry.userId)])).toEqual([
      [pizza.id, 1800, [TOMAS]],
      [beer.id, 800, [SARA]],
    ]);
    expect(saved.amountCents).toBe(2600);
    expect(saved.payers).toEqual([{ userId: SARA, amountCents: 2600 }]);
    expect(Object.fromEntries(saved.splits.map((split) => [split.userId, split.owedCents]))).toEqual({ [TOMAS]: 1800, [SARA]: 800 });
    expect(saved.version).toBe(dinner.version + 2);
    expect(saved.updatedBy).toBe(SARA);
  });

  it("saves nothing when both changed the same thing differently, and says so with Aborted", async () => {
    const [pizza, beer] = dinner.items;
    await usecase.updateExpense(TOMAS, dinner.id, editOf(dinner, {
      amountCents: 2600,
      payers: [{ userId: SARA, amountCents: 2600 }],
      items: [{ ...pizza, totalCents: 1800 }, beer],
    }), false, dinner);
    const before = await stored(dinner.id);

    await expect(usecase.updateExpense(SARA, dinner.id, editOf(dinner, {
      amountCents: 3000,
      payers: [{ userId: SARA, amountCents: 3000 }],
      description: "Supper",
      items: [{ ...pizza, totalCents: 2200 }, beer],
    }), false, dinner)).rejects.toMatchObject({ code: "aborted" });

    const after = await stored(dinner.id);
    expect(after).toEqual(before);
    expect(after.description).toBe("Dinner");
  });

  it("merges a change to the date with a change to the amount of an equal split", async () => {
    const lunch = await usecase.createExpense(SARA, {
      ...(dinnerRequest() as object),
      description: "Lunch",
      amountCents: 10000,
      splitType: "equal",
      payers: [{ userId: SARA, amountCents: 10000 }],
      splitSpecs: [SARA, TOMAS, PRIYA].map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })),
      items: [],
    } as never);

    // Tomas's form lists him first, which is all that differs in his split.
    const tomasOrder = [TOMAS, SARA, PRIYA].map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 }));
    await usecase.updateExpense(TOMAS, lunch.id, editOf(lunch, { splitSpecs: tomasOrder, expenseDate: "2026-10-28" }), false, lunch);
    await usecase.updateExpense(SARA, lunch.id, editOf(lunch, {
      amountCents: 12000,
      payers: [{ userId: SARA, amountCents: 12000 }],
      splitSpecs: [SARA, TOMAS, PRIYA].map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })),
    }), false, lunch);

    const saved = await stored(lunch.id);
    expect(saved.expenseDate).toBe("2026-10-28");
    expect(saved.amountCents).toBe(12000);
    expect(saved.splits.map((split) => split.owedCents)).toEqual([4000, 4000, 4000]);
  });

  it("keeps a receipt line's id across edits", async () => {
    const [pizza, beer] = dinner.items;

    await usecase.updateExpense(SARA, dinner.id, editOf(dinner, { description: "Birthday dinner" }), false, dinner);

    expect((await stored(dinner.id)).items.map((item) => item.id)).toEqual([pizza.id, beer.id]);
  });

  it("never takes over an id it did not save", async () => {
    const other = await usecase.createExpense(SARA, dinnerRequest());
    const [pizza, beer] = dinner.items;

    await usecase.updateExpense(SARA, dinner.id, editOf(dinner, { items: [pizza, { ...beer, id: other.items[0].id }] }));

    const saved = await stored(dinner.id);
    expect(saved.items.map((item) => item.id)).toContain(pizza.id);
    expect(saved.items.map((item) => item.id)).not.toContain(other.items[0].id);
    expect((await stored(other.id)).items.map((item) => item.id)).toContain(other.items[0].id);
  });

  it("does not save or announce a retry of an edit a second time", async () => {
    const operationId = randomUUID();
    const edit = editOf(dinner, { description: "Birthday dinner", operationId });
    const before = await announcements(dinner.id);

    await usecase.updateExpense(SARA, dinner.id, edit, false, dinner);
    const once = await announcements(dinner.id);
    await usecase.updateExpense(SARA, dinner.id, edit, false, dinner);

    expect((await stored(dinner.id)).version).toBe(dinner.version + 1);
    expect(once.bell).toBeGreaterThan(before.bell);
    expect(await announcements(dinner.id)).toEqual(once);
  });

  it("does not undo somebody else's save when a retry of an older edit arrives", async () => {
    const operationId = randomUUID();
    const retried = editOf(dinner, { description: "Birthday dinner", operationId });
    await usecase.updateExpense(SARA, dinner.id, retried, false, dinner);
    await usecase.updateExpense(TOMAS, dinner.id, editOf(dinner, { description: "Birthday dinner", notes: "At Luigi's" }), false, dinner);

    await usecase.updateExpense(SARA, dinner.id, retried, false, dinner);

    expect((await stored(dinner.id)).notes).toBe("At Luigi's");
  });

  it("saves and announces nothing for an edit that changes nothing", async () => {
    const before = await announcements(dinner.id);

    await usecase.updateExpense(TOMAS, dinner.id, editOf(dinner, {}), false, dinner);

    expect((await stored(dinner.id)).version).toBe(dinner.version);
    expect(await announcements(dinner.id)).toEqual(before);
  });

  it("still lets an app from before merging replace the whole expense", async () => {
    await usecase.updateExpense(TOMAS, dinner.id, editOf(dinner, { description: "Supper" }), false, dinner);

    await usecase.updateExpense(SARA, dinner.id, editOf(dinner, { notes: "Old app" }));

    const saved = await stored(dinner.id);
    expect(saved.description).toBe("Dinner");
    expect(saved.notes).toBe("Old app");
  });

  it("reports the version an open form compares with", async () => {
    expect(await usecase.getExpenseVersion(TOMAS, dinner.id)).toEqual({ version: dinner.version });

    await usecase.updateExpense(SARA, dinner.id, editOf(dinner, { description: "Supper" }), false, dinner);

    expect(await usecase.getExpenseVersion(TOMAS, dinner.id)).toEqual({ version: dinner.version + 1 });
  });

  it("stores a comment once when its request is retried, and tells everyone once", async () => {
    const operationId = randomUUID();
    const first = await usecase.addComment(TOMAS, dinner.id, "I paid cash for this", operationId);
    const once = await announcements(dinner.id);

    const retried = await usecase.addComment(TOMAS, dinner.id, "I paid cash for this", operationId);

    expect(retried.id).toBe(first.id);
    expect(await announcements(dinner.id)).toEqual(once);
    expect((await usecase.getExpense(TOMAS, dinner.id)).comments).toHaveLength(1);
  });

  it("stores the same words again as a new comment when they are a new attempt", async () => {
    await usecase.addComment(TOMAS, dinner.id, "Thanks", randomUUID());
    await usecase.addComment(TOMAS, dinner.id, "Thanks", randomUUID());

    expect((await usecase.getExpense(TOMAS, dinner.id)).comments).toHaveLength(2);
  });

  it("keeps the balance right after a merged edit", async () => {
    const [pizza, beer] = dinner.items;
    await usecase.updateExpense(TOMAS, dinner.id, editOf(dinner, {
      amountCents: 2600,
      payers: [{ userId: SARA, amountCents: 2600 }],
      items: [{ ...pizza, totalCents: 1800 }, beer],
    }), false, dinner);
    await usecase.updateExpense(PRIYA, dinner.id, editOf(dinner, { notes: "Thanks Sara" }), false, dinner);

    const nets = await balances.userNetInGroup(TOMAS, FLAT);
    expect(nets.get("USD")).toBeLessThan(0);
    expect((await stored(dinner.id)).notes).toBe("Thanks Sara");
    expect((await stored(dinner.id)).amountCents).toBe(2600);
  });
});

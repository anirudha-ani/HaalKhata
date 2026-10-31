/**
 * Real PostgreSQL test of a live split from start to finish: a bill opened to
 * the table through a link, people joining and claiming lines at the same
 * moment, and one summary at the end. What it pins down is what the feature
 * promises the ledger: the balance is exact at every step, even with lines
 * nobody has claimed; nobody's phone buzzes per tick; and when it is over the
 * expense is an ordinary one, and the link and any access it gave are gone.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE_ACCOUNT_CONFIRMATION } from "@/server/auth/accountDeletion.constants";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_live_split_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const SARA = "user-sara";
const TOMAS = "user-tomas";
const PRIYA = "user-priya";
const LENA = "user-lena";
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

describe.skipIf(!reachable)("a live split, against Postgres", () => {
  let database: Client;
  let expenses: typeof import("../expense.usecase");
  let balances: typeof import("../balance.usecase");
  let live: typeof import("./liveSplit.usecase");
  let social: typeof import("@/server/social/usecase/social.usecase");
  let deletion: typeof import("@/server/auth/usecase/deletion/accountDeletion.usecase");
  let closePool: () => Promise<void>;
  type Saved = Awaited<ReturnType<typeof expenses.createExpense>>;

  /**
   * A bill Sara paid, as a request: pizza, beer and salad, nobody on any line.
   *
   * @param change - Fields to change.
   * @returns The request.
   */
  const billRequest = (change: Record<string, unknown> = {}) => ({
    groupId: "",
    description: "Dinner",
    amountCents: 3700,
    currency: "USD",
    category: "food",
    expenseDate: "2026-10-30",
    splitType: "itemized",
    notes: "",
    payers: [{ userId: SARA, amountCents: 3700 }],
    splitSpecs: [],
    items: [
      { id: "", name: "Pizza", quantity: 1, totalCents: 2000, assignments: [] },
      { id: "", name: "Beer", quantity: 1, totalCents: 800, assignments: [] },
      { id: "", name: "Salad", quantity: 1, totalCents: 900, assignments: [] },
    ],
    taxCents: 0,
    tipCents: 0,
    operationId: randomUUID(),
    startLiveSplit: true,
    ...change,
  }) as never;

  /**
   * What a tap on a live split's screen sends: the expense as that phone knows
   * it, with one change.
   *
   * @param saved - The expense as the phone knows it.
   * @param change - Fields to change.
   * @returns The request.
   */
  const editOf = (saved: Saved, change: Record<string, unknown>) => ({
    groupId: saved.groupId,
    description: saved.description,
    amountCents: saved.amountCents,
    currency: saved.currency,
    category: saved.category,
    expenseDate: saved.expenseDate,
    splitType: saved.splitType,
    notes: saved.notes,
    payers: saved.payers,
    splitSpecs: [],
    items: saved.items,
    taxCents: saved.taxCents,
    tipCents: saved.tipCents,
    operationId: randomUUID(),
    startLiveSplit: false,
    ...change,
  }) as never;

  /**
   * Puts somebody on one line, as tapping "mine" does.
   *
   * @param saved - The expense as the phone knows it.
   * @param userId - Who.
   * @param lineName - Which line.
   * @returns The request.
   */
  const claim = (saved: Saved, userId: string, lineName: string) =>
    editOf(saved, {
      items: saved.items.map((item) =>
        item.name === lineName ? { ...item, assignments: [...item.assignments, { userId, weight: 1 }] } : item,
      ),
    });

  /**
   * The expense as somebody reads it now.
   *
   * @param expenseId - The expense.
   * @param viewerId - Who reads it.
   * @returns The response.
   */
  const read = (expenseId: string, viewerId = SARA) => expenses.getExpense(viewerId, expenseId);

  /**
   * What each person owes on an expense.
   *
   * @param expenseId - The expense.
   * @returns Person id to cents.
   */
  const owed = async (expenseId: string) =>
    Object.fromEntries((await read(expenseId)).expense!.splits.map((split) => [split.userId, split.owedCents]));

  /**
   * Bell rows about an expense.
   *
   * @param expenseId - The expense.
   * @returns Who was told what, sorted.
   */
  const bell = async (expenseId: string) =>
    (await database.query<{ user_id: string; title: string; body: string }>(
      `SELECT user_id, title, body FROM notifications WHERE link = $1 ORDER BY user_id`,
      [`/expenses/${expenseId}`],
    )).rows;

  /**
   * Starts a split on a new bill and brings people in through its link.
   *
   * @param people - Who joins.
   * @param change - Changes to the bill.
   * @returns The expense and its link's token.
   */
  const openBill = async (people: string[] = [], change: Record<string, unknown> = {}) => {
    const created = await expenses.createExpense(SARA, billRequest(change));
    const token = (await read(created.id)).liveSplit!.token;
    for (const person of people) await social.acceptInviteLink(person, token);
    return { id: created.id, token, saved: (await read(created.id)).expense! as Saved };
  };

  /**
   * Adds a person with no connection to anybody.
   *
   * @param name - What they are called.
   * @returns Their id.
   */
  const stranger = async (name: string) => {
    const userId = `user-${randomUUID()}`;
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
       VALUES ($1, $1 || '@example.com', $2, '#c73e2e', now(), 'google-' || $1)`,
      [userId, name],
    );
    return userId;
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
    expenses = await import("../expense.usecase");
    balances = await import("../balance.usecase");
    live = await import("./liveSplit.usecase");
    social = await import("@/server/social/usecase/social.usecase");
    deletion = await import("@/server/auth/usecase/deletion/accountDeletion.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
       SELECT id, lower(name) || '@example.com', name, '#c73e2e', now(), 'google-' || id
         FROM (VALUES ($1, 'Sara'), ($2, 'Tomas'), ($3, 'Priya'), ($4, 'Lena')) AS person(id, name)`,
      [SARA, TOMAS, PRIYA, LENA],
    );
    await database.query(`INSERT INTO groups (id, name, currency, created_by) VALUES ($1, 'Flat', 'USD', $2)`, [FLAT, SARA]);
    await database.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`, [FLAT, SARA]);
  }, 60_000);

  beforeEach(async () => {
    await database.query(`DELETE FROM user_blocks`);
  });

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("starts with a new bill: nothing claimed, nobody told, and nobody owes anybody", async () => {
    const { id, token } = await openBill();

    const response = await read(id);
    expect(response.liveSplit).toMatchObject({ token, hostId: SARA, peopleIds: [SARA] });
    expect(new Date(response.liveSplit!.endsAt).getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect(new Date(response.liveSplit!.endsAt).getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60_000);
    expect(response.expense!.items.map((item) => item.assignments)).toEqual([[], [], []]);
    expect(await owed(id)).toEqual({ [SARA]: 3700 });
    expect(await bell(id)).toEqual([]);
  });

  it("shows what a link offers before anyone signs in", async () => {
    const { token } = await openBill();

    expect(await social.previewInviteLink(token)).toMatchObject({
      kind: "live",
      inviterName: "Sara",
      expenseDescription: "Dinner",
      totalCents: 3700,
      currency: "USD",
      memberCount: 1,
      groupName: "",
    });
  });

  it("lets anyone with the link in, befriends them with whoever paid, and nobody else can see it", async () => {
    const { id, token, saved } = await openBill();
    await expect(read(id, PRIYA)).rejects.toMatchObject({ code: "permission_denied" });

    const { expenseId } = await social.acceptInviteLink(PRIYA, token);

    expect(expenseId).toBe(id);
    const joined = await read(id, PRIYA);
    expect(joined.liveSplit!.peopleIds).toEqual([SARA, PRIYA]);
    expect(joined.users.map((user) => user.id)).toContain(PRIYA);
    expect(joined.expense!.version).toBe(saved.version + 1);
    const { rows } = await database.query(`SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2`, [PRIYA, SARA]);
    expect(rows).toHaveLength(1);
  });

  it("joining twice changes nothing", async () => {
    const { id, token } = await openBill([TOMAS]);
    const before = (await read(id)).expense!.version;

    await social.acceptInviteLink(TOMAS, token);

    expect((await read(id)).liveSplit!.peopleIds).toEqual([SARA, TOMAS]);
    expect((await read(id)).expense!.version).toBe(before);
  });

  it("keeps the balance exact as lines are claimed, and tells nobody", async () => {
    const { id, saved } = await openBill([TOMAS, PRIYA]);

    await expenses.updateExpense(TOMAS, id, claim(saved, TOMAS, "Pizza"), false, saved);

    expect(await owed(id)).toEqual({ [SARA]: 1700, [TOMAS]: 2000, [PRIYA]: 0 });
    expect((await balances.netWithUser(SARA, TOMAS)).get("USD")).toBeGreaterThanOrEqual(2000);
    expect(await bell(id)).toEqual([]);
  });

  it("takes everybody's claims when they tap at the same moment", async () => {
    const { id, saved } = await openBill([TOMAS, PRIYA]);

    await Promise.all([
      expenses.updateExpense(TOMAS, id, claim(saved, TOMAS, "Pizza"), false, saved),
      expenses.updateExpense(PRIYA, id, claim(saved, PRIYA, "Pizza"), false, saved),
      expenses.updateExpense(PRIYA, id, claim(saved, PRIYA, "Beer"), false, saved),
    ]);

    const items = (await read(id)).expense!.items;
    expect(items[0].assignments.map((entry) => entry.userId).sort()).toEqual([PRIYA, TOMAS]);
    expect(items[1].assignments.map((entry) => entry.userId)).toEqual([PRIYA]);
    expect(await owed(id)).toEqual({ [SARA]: 900, [TOMAS]: 1000, [PRIYA]: 1800 });
  });

  it("lets people who do not know each other share the bill", async () => {
    const { id, saved } = await openBill([TOMAS, LENA]);

    await expenses.updateExpense(LENA, id, claim(saved, LENA, "Salad"), false, saved);
    const latest = (await read(id)).expense! as Saved;
    await expenses.updateExpense(TOMAS, id, claim(latest, TOMAS, "Salad"), false, latest);

    expect(await owed(id)).toMatchObject({ [LENA]: 450, [TOMAS]: 450 });
  });

  it("lets anyone fix the receipt, and the total and who paid follow", async () => {
    const { id, saved } = await openBill([TOMAS]);
    const [pizza, beer] = saved.items;

    await expenses.updateExpense(TOMAS, id, editOf(saved, {
      amountCents: 3200,
      payers: [{ userId: SARA, amountCents: 3200 }],
      items: [{ ...pizza, totalCents: 1800 }, beer, { id: "", name: "Water", quantity: 1, totalCents: 600, assignments: [] }],
    }), false, saved);

    const expense = (await read(id)).expense!;
    expect(expense.items.map((item) => [item.name, item.totalCents])).toEqual([["Pizza", 1800], ["Beer", 800], ["Water", 600]]);
    expect(expense.amountCents).toBe(3200);
    expect(expense.payers).toEqual([{ userId: SARA, amountCents: 3200 }]);
  });

  it("only lets whoever started it finish it early", async () => {
    const { id } = await openBill([TOMAS]);

    await expect(live.finishLiveSplit(TOMAS, id)).rejects.toMatchObject({ code: "permission_denied" });
    expect((await read(id)).liveSplit).toBeDefined();
  });

  it("tells everyone what they owe once, and leaves an ordinary expense", async () => {
    const { id, token, saved } = await openBill([TOMAS, PRIYA]);
    await expenses.updateExpense(TOMAS, id, claim(saved, TOMAS, "Pizza"), false, saved);

    await live.finishLiveSplit(SARA, id);

    const after = await read(id);
    expect(after.liveSplit).toBeUndefined();
    expect(await bell(id)).toEqual([
      { user_id: TOMAS, title: 'Sara added "Dinner"', body: "One-off expense · you owe Sara $20.00" },
    ]);
    // The lines nobody claimed are Sara's for good, and no money moved.
    expect(after.expense!.items.map((item) => item.assignments.map((entry) => entry.userId))).toEqual([[TOMAS], [SARA], [SARA]]);
    expect(await owed(id)).toEqual({ [SARA]: 1700, [TOMAS]: 2000 });
    // The link says it is over, and it no longer lets anyone in.
    await expect(social.previewInviteLink(token)).rejects.toMatchObject({ code: "failed_precondition", message: "this live split has ended" });
    await expect(social.acceptInviteLink(LENA, token)).rejects.toMatchObject({ code: "failed_precondition" });
    // Priya claimed nothing, so she has no reason to see it any more.
    await expect(read(id, PRIYA)).rejects.toMatchObject({ code: "permission_denied" });
    // It can be edited like any other expense, with nothing announced twice.
    const finished = after.expense! as Saved;
    await expenses.updateExpense(SARA, id, editOf(finished, { notes: "Thanks all" }), false, finished);
    expect((await read(id)).expense!.notes).toBe("Thanks all");
  });

  it("still lets two people who met over the bill correct it afterwards", async () => {
    const { id, saved } = await openBill([TOMAS, PRIYA]);
    await expenses.updateExpense(TOMAS, id, claim(saved, TOMAS, "Pizza"), false, saved);
    const claimed = (await read(id)).expense! as Saved;
    await expenses.updateExpense(PRIYA, id, claim(claimed, PRIYA, "Beer"), false, claimed);
    await live.finishLiveSplit(SARA, id);

    const finished = (await read(id)).expense! as Saved;
    await expenses.updateExpense(TOMAS, id, editOf(finished, { notes: "It was a Tuesday" }), false, finished);

    expect((await read(id)).expense!.notes).toBe("It was a Tuesday");
  });

  it("does not let a payer put somebody they removed back in debt", async () => {
    await database.query(`INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`, [SARA, LENA]);
    const bill = await expenses.createExpense(SARA, billRequest({
      startLiveSplit: false,
      items: [
        { id: "", name: "Pizza", quantity: 1, totalCents: 2000, assignments: [{ userId: LENA, weight: 1 }] },
        { id: "", name: "Rest", quantity: 1, totalCents: 1700, assignments: [{ userId: SARA, weight: 1 }] },
      ],
    }));
    await database.query(`DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`, [SARA, LENA]);

    await expect(
      expenses.updateExpense(SARA, bill.id, editOf(bill, { notes: "Pay up" }), false, bill),
    ).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("finishes by itself when its time is up, once", async () => {
    const { id, saved } = await openBill([TOMAS]);
    await expenses.updateExpense(TOMAS, id, claim(saved, TOMAS, "Beer"), false, saved);
    await database.query(`UPDATE live_splits SET ends_at = now() - interval '1 second' WHERE expense_id = $1`, [id]);

    expect((await read(id)).liveSplit).toBeUndefined();
    expect(await live.finishDueLiveSplits()).toBeGreaterThanOrEqual(1);
    expect(await live.finishDueLiveSplits()).toBe(0);

    expect(await bell(id)).toHaveLength(1);
    expect((await read(id)).expense!.items[0].assignments.map((entry) => entry.userId)).toEqual([SARA]);
  });

  it("lets an edit through past the end, before the sweep has got to it", async () => {
    const { id, saved } = await openBill([TOMAS]);
    await expenses.updateExpense(TOMAS, id, claim(saved, TOMAS, "Beer"), false, saved);
    const latest = (await read(id)).expense! as Saved;
    await database.query(`UPDATE live_splits SET ends_at = now() - interval '1 second' WHERE expense_id = $1`, [id]);

    await expenses.updateExpense(SARA, id, editOf(latest, { notes: "Late" }), false, latest);

    const after = await read(id);
    expect(after.expense!.notes).toBe("Late");
    expect(after.expense!.items[1].assignments.map((entry) => entry.userId)).toEqual([TOMAS]);
    expect(await database.query(`SELECT 1 FROM live_splits WHERE expense_id = $1 AND finished_at IS NULL`, [id])).toMatchObject({ rowCount: 0 });
  });

  it("opens on a saved receipt, keeps what it already says, and says nothing if nothing changed", async () => {
    const created = await expenses.createExpense(SARA, billRequest({
      startLiveSplit: false,
      items: [{ id: "", name: "Pizza", quantity: 1, totalCents: 3700, assignments: [{ userId: SARA, weight: 1 }] }],
    }));
    const before = (await bell(created.id)).length;

    const split = await live.startLiveSplit(SARA, created.id);

    expect((await live.startLiveSplit(SARA, created.id)).token).toBe(split.token);
    await live.finishLiveSplit(SARA, created.id);
    expect((await bell(created.id)).length).toBe(before);
    expect((await read(created.id)).liveSplit).toBeUndefined();
  });

  describe("on the ordinary form", () => {
    /**
     * A saved bill Sara paid, split evenly between her and Tomas.
     *
     * @param change - Changes to the request.
     * @returns The saved bill.
     */
    const evenBill = (change: Record<string, unknown> = {}) =>
      expenses.createExpense(SARA, billRequest({
        splitType: "equal",
        amountCents: 3000,
        items: [],
        taxCents: 0,
        tipCents: 0,
        startLiveSplit: false,
        payers: [{ userId: SARA, amountCents: 3000 }],
        splitSpecs: [SARA, TOMAS].map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })),
        ...change,
      }));

    /**
     * What saving the even split among some people sends, as the form does.
     *
     * @param saved - The bill as the form opened it.
     * @param userIds - Who is ticked.
     * @returns The request.
     */
    const evenSave = (saved: Saved, userIds: string[]) =>
      editOf(saved, { items: [], splitSpecs: userIds.map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })) });

    it("opens with nothing on it yet, and goes away if nothing ever is", async () => {
      const created = await expenses.createExpense(SARA, billRequest({
        description: "Receipt",
        splitType: "equal",
        amountCents: 0,
        items: [],
        taxCents: 0,
        tipCents: 0,
        payers: [{ userId: SARA, amountCents: 0 }],
        splitSpecs: [],
      }));
      expect((await read(created.id)).liveSplit?.peopleIds).toEqual([SARA]);
      expect(await owed(created.id)).toEqual({ [SARA]: 0 });

      await live.finishLiveSplit(SARA, created.id);

      const ended = await read(created.id);
      expect(ended.expense?.deletedAt).not.toBe("");
      expect((await bell(created.id)).length).toBe(0);
    });

    it("fills in like any bill once somebody saves real numbers", async () => {
      const created = await expenses.createExpense(SARA, billRequest({
        splitType: "equal", amountCents: 0, items: [], taxCents: 0, tipCents: 0,
        payers: [{ userId: SARA, amountCents: 0 }], splitSpecs: [],
      }));
      const token = (await read(created.id)).liveSplit!.token;
      await social.acceptInviteLink(TOMAS, token);
      const opened = (await read(created.id)).expense! as Saved;

      await expenses.updateExpense(TOMAS, created.id, editOf(opened, {
        amountCents: 3000,
        items: [],
        payers: [{ userId: SARA, amountCents: 3000 }],
        splitSpecs: [SARA, TOMAS].map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })),
      }), false, opened);

      expect(await owed(created.id)).toEqual({ [SARA]: 1500, [TOMAS]: 1500 });
      expect((await read(created.id)).expense?.payers).toEqual([expect.objectContaining({ userId: SARA, amountCents: 3000 })]);
      expect((await balances.netWithUser(SARA, TOMAS)).get("USD")).toBeGreaterThanOrEqual(1500);
      await live.finishLiveSplit(SARA, created.id);
      expect((await read(created.id)).expense?.deletedAt).toBe("");
    });

    it("runs on an even bill without changing how it is split", async () => {
      const saved = await evenBill();
      await live.startLiveSplit(SARA, saved.id);
      const opened = await read(saved.id);
      expect(opened.expense?.splitType).toBe("equal");
      expect(opened.expense?.items).toEqual([]);
      expect(await owed(saved.id)).toEqual({ [SARA]: 1500, [TOMAS]: 1500 });
    });

    it("puts whoever joins on the expense with nothing to pay, moving no money", async () => {
      const saved = await evenBill();
      const guest = await stranger("Noor");
      const { token } = await live.startLiveSplit(SARA, saved.id);

      await social.acceptInviteLink(guest, token);

      expect(await owed(saved.id)).toEqual({ [SARA]: 1500, [TOMAS]: 1500, [guest]: 0 });
      expect((await read(saved.id, guest)).liveSplit?.peopleIds).toEqual([SARA, guest]);
    });

    it("gives somebody who joined the same edit anyone has, and shows they saved", async () => {
      const saved = await evenBill();
      const guest = await stranger("Noor");
      const { token } = await live.startLiveSplit(SARA, saved.id);
      await social.acceptInviteLink(guest, token);
      expect((await read(saved.id)).liveSplit?.savedIds).toEqual([]);
      const opened = (await read(saved.id, guest)).expense! as Saved;

      await expenses.updateExpense(guest, saved.id, evenSave(opened, [SARA, TOMAS, guest]), false, opened);

      expect(await owed(saved.id)).toEqual({ [SARA]: 1000, [TOMAS]: 1000, [guest]: 1000 });
      expect((await read(saved.id)).liveSplit?.savedIds).toEqual([guest]);
    });

    it("counts pressing Save with nothing to change as having saved", async () => {
      const saved = await evenBill();
      await live.startLiveSplit(SARA, saved.id);
      const opened = (await read(saved.id)).expense! as Saved;
      const before = opened.version;

      await expenses.updateExpense(SARA, saved.id, evenSave(opened, [SARA, TOMAS]), false, opened);

      const after = await read(saved.id);
      expect(after.liveSplit?.savedIds).toEqual([SARA]);
      expect(after.expense!.version).toBeGreaterThan(before);
    });

    it("does not let somebody joining disturb what another person is typing", async () => {
      const saved = await evenBill();
      const guest = await stranger("Noor");
      const { token } = await live.startLiveSplit(SARA, saved.id);
      const openedBeforeTheyJoined = (await read(saved.id)).expense! as Saved;
      await social.acceptInviteLink(guest, token);

      await expenses.updateExpense(SARA, saved.id, editOf(openedBeforeTheyJoined, {
        amountCents: 4000,
        items: [],
        payers: [{ userId: SARA, amountCents: 4000 }],
        splitSpecs: [SARA, TOMAS].map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })),
      }), false, openedBeforeTheyJoined);

      expect(await owed(saved.id)).toEqual({ [SARA]: 2000, [TOMAS]: 2000, [guest]: 0 });
      expect((await read(saved.id)).expense?.payers).toEqual([expect.objectContaining({ userId: SARA, amountCents: 4000 })]);
    });

    it("keeps what each of several people paid adding up when the total moves", async () => {
      const saved = await evenBill({ payers: [{ userId: SARA, amountCents: 2000 }, { userId: TOMAS, amountCents: 1000 }] });
      await live.startLiveSplit(SARA, saved.id);
      const opened = (await read(saved.id)).expense! as Saved;

      await expenses.updateExpense(SARA, saved.id, editOf(opened, {
        amountCents: 6000,
        items: [],
        splitSpecs: [SARA, TOMAS].map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })),
        payers: [{ userId: SARA, amountCents: 4000 }, { userId: TOMAS, amountCents: 2000 }],
      }), false, opened);

      const paid = (await read(saved.id)).expense!.payers.reduce((total, payer) => total + payer.amountCents, 0);
      expect(paid).toBe(6000);
    });

    it("counts whoever joined since the last save when it ends, so nobody gets a free meal", async () => {
      const saved = await evenBill();
      const guest = await stranger("Noor");
      const { token } = await live.startLiveSplit(SARA, saved.id);
      await social.acceptInviteLink(guest, token);

      await live.finishLiveSplit(SARA, saved.id);

      expect(Object.values(await owed(saved.id)).sort()).toEqual([1000, 1000, 1000]);
      expect((await bell(saved.id)).map((notice) => notice.user_id)).toContain(guest);
    });

    it("leaves off anybody unticked after they joined", async () => {
      const saved = await evenBill();
      const guest = await stranger("Noor");
      const { token } = await live.startLiveSplit(SARA, saved.id);
      await social.acceptInviteLink(guest, token);
      const opened = (await read(saved.id)).expense! as Saved;

      await expenses.updateExpense(SARA, saved.id, editOf(opened, {
        amountCents: 3001,
        items: [],
        payers: [{ userId: SARA, amountCents: 3001 }],
        splitSpecs: [SARA, TOMAS].map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })),
      }), false, opened);
      await live.finishLiveSplit(SARA, saved.id);

      expect(Object.keys(await owed(saved.id)).sort()).toEqual([SARA, TOMAS].sort());
    });

    it("takes somebody who ended with nothing to pay off an unevenly split bill", async () => {
      const saved = await evenBill({
        splitType: "exact",
        splitSpecs: [
          { userId: SARA, amountCents: 1000, percentBp: 0, shares: 0 },
          { userId: TOMAS, amountCents: 2000, percentBp: 0, shares: 0 },
        ],
      });
      const guest = await stranger("Noor");
      const { token } = await live.startLiveSplit(SARA, saved.id);
      await social.acceptInviteLink(guest, token);
      expect(await owed(saved.id)).toEqual({ [SARA]: 1000, [TOMAS]: 2000, [guest]: 0 });

      await live.finishLiveSplit(SARA, saved.id);

      expect(await owed(saved.id)).toEqual({ [SARA]: 1000, [TOMAS]: 2000 });
    });
  });

  describe("with more than one card", () => {
    /** Sara paid $20 and Tomas $17. */
    const twoCards = [{ userId: SARA, amountCents: 2000 }, { userId: TOMAS, amountCents: 1700 }];

    it("starts with several people having paid", async () => {
      const { id } = await openBill([TOMAS], { payers: twoCards });

      expect(await owed(id)).toEqual({ [SARA]: 2000, [TOMAS]: 1700 });
    });

    it("lets somebody add their card halfway, and that alone puts nobody in debt, not even by a cent", async () => {
      const { id, saved } = await openBill([TOMAS]);

      await expenses.updateExpense(TOMAS, id, editOf(saved, { payers: twoCards }), false, saved);

      expect(await owed(id)).toEqual({ [SARA]: 2000, [TOMAS]: 1700 });
      expect(await bell(id)).toEqual([]);
    });

    it("keeps the ordinary form usable while lines are still unclaimed", async () => {
      const { id, saved } = await openBill([TOMAS], { payers: twoCards });

      await expenses.updateExpense(SARA, id, editOf(saved, { description: "Supper" }), false, saved);

      expect((await read(id)).expense!.description).toBe("Supper");
    });

    it("sends each person's debt to those who paid, and ends with an ordinary bill that moved no money", async () => {
      const { id, saved } = await openBill([TOMAS, PRIYA], { payers: twoCards });
      await expenses.updateExpense(PRIYA, id, claim(saved, PRIYA, "Pizza"), false, saved);
      const before = await owed(id);

      await live.finishLiveSplit(SARA, id);

      expect(await owed(id)).toEqual(before);
      const { items } = (await read(id)).expense!;
      expect(items.find((item) => item.name === "Beer")!.assignments).toEqual(
        expect.arrayContaining([{ userId: SARA, weight: 20 }, { userId: TOMAS, weight: 17 }]),
      );
      expect(await bell(id)).toHaveLength(2);

      const edited = (await read(id)).expense! as Saved;
      await expenses.updateExpense(SARA, id, editOf(edited, { notes: "Cards at the bar" }), false, edited);
      expect(await owed(id)).toEqual(before);
    });

    it("connects whoever adds their card to everyone on the bill, so they can settle later", async () => {
      const guest = await stranger("Noor");
      const cardHolder = await stranger("Ines");
      const { id, saved } = await openBill([guest, cardHolder]);
      await expenses.updateExpense(guest, id, claim(saved, guest, "Pizza"), false, saved);
      const claimed = (await read(id)).expense! as Saved;

      await expenses.updateExpense(cardHolder, id, editOf(claimed, {
        payers: [{ userId: SARA, amountCents: 700 }, { userId: cardHolder, amountCents: 3000 }],
      }), false, claimed);
      await live.finishLiveSplit(SARA, id);

      const friends = await database.query(`SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2`, [guest, cardHolder]);
      expect(friends.rows).toHaveLength(1);
      const owedToCard = (await balances.netWithUser(cardHolder, guest)).get("USD") ?? 0;
      expect(owedToCard).toBeGreaterThan(0);
      await expenses.recordSettlement(guest, {
        groupId: "",
        toUserId: cardHolder,
        amountCents: owedToCard,
        currency: "USD",
        method: "cash",
        note: "",
        operationId: randomUUID(),
      } as never);
      expect((await balances.netWithUser(cardHolder, guest)).get("USD") ?? 0).toBe(0);
    });

    it("brings a later joiner together with every payer", async () => {
      const guest = await stranger("Maya");
      const { token } = await openBill([TOMAS], { payers: twoCards });

      await social.acceptInviteLink(guest, token);

      const { rows } = await database.query(`SELECT friend_id FROM friendships WHERE user_id = $1`, [guest]);
      expect(rows.map((friend) => friend.friend_id).sort()).toEqual([SARA, TOMAS].sort());
    });

    it("lets a second split open on a bill several people paid", async () => {
      const { id, saved } = await openBill([TOMAS], { payers: twoCards });
      await live.finishLiveSplit(SARA, id);

      await expect(live.startLiveSplit(TOMAS, saved.id)).resolves.toMatchObject({ hostId: TOMAS });
    });
  });

  it("on a group's bill, joining joins the group, as the page says first", async () => {
    const { id, token } = await openBill([], { groupId: FLAT });

    expect((await social.previewInviteLink(token)).groupName).toBe("Flat");
    await social.acceptInviteLink(TOMAS, token);

    const { rows } = await database.query(`SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2`, [FLAT, TOMAS]);
    expect(rows).toEqual([{ role: "member" }]);
    expect((await read(id)).liveSplit!.peopleIds).toContain(TOMAS);
    await live.finishLiveSplit(SARA, id);
  });

  it("keeps out somebody blocked by whoever started it or paid", async () => {
    const { token } = await openBill();
    await database.query(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [SARA, LENA]);

    await expect(social.acceptInviteLink(LENA, token)).rejects.toMatchObject({ code: "not_found" });
  });

  it("carries on when somebody in it deletes their account, and still ends cleanly", async () => {
    const hostId = `user-${randomUUID()}`;
    const guestId = `user-${randomUUID()}`;
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
       VALUES ($1, $1 || '@example.com', 'Noor', '#c73e2e', now(), 'google-' || $1),
              ($2, $2 || '@example.com', 'Ines', '#c73e2e', now(), 'google-' || $2)`,
      [hostId, guestId],
    );
    const created = await expenses.createExpense(hostId, billRequest({ payers: [{ userId: hostId, amountCents: 3700 }] }));
    const { id } = created;
    const token = (await expenses.getExpense(hostId, id)).liveSplit!.token;
    await social.acceptInviteLink(TOMAS, token);
    await social.acceptInviteLink(guestId, token);
    await expenses.updateExpense(TOMAS, id, claim(created, TOMAS, "Beer"), false, created);

    await deletion.deleteAccount(guestId, DELETE_ACCOUNT_CONFIRMATION);
    await deletion.deleteAccount(hostId, DELETE_ACCOUNT_CONFIRMATION);

    const running = await expenses.getExpense(TOMAS, id);
    expect(running.liveSplit?.peopleIds).toEqual([expect.not.stringMatching(new RegExp(`${guestId}|${hostId}`))]);
    expect(running.liveSplit?.hostId).not.toBe(hostId);
    expect(running.liveSplit?.token).toBe("");
    await expect(social.previewInviteLink(token)).rejects.toMatchObject({ code: "not_found" });

    await database.query(`UPDATE live_splits SET ends_at = now() - interval '1 second' WHERE expense_id = $1`, [id]);
    expect(await live.finishDueLiveSplits()).toBeGreaterThanOrEqual(1);
    const { rows } = await database.query(`SELECT count(*)::int AS running FROM live_splits WHERE expense_id = $1 AND finished_at IS NULL`, [id]);
    expect(rows[0].running).toBe(0);
    expect((await bell(id)).map((entry) => entry.user_id)).toEqual([TOMAS]);
    expect((await expenses.getExpense(TOMAS, id)).expense!.splits.find((split) => split.userId === TOMAS)?.owedCents).toBe(800);
  });

  it("ends with the expense when it is deleted", async () => {
    const { id, token } = await openBill([TOMAS]);

    await expenses.deleteExpense(SARA, id);

    await expect(social.previewInviteLink(token)).rejects.toMatchObject({ code: "failed_precondition" });
    expect((await read(id)).liveSplit).toBeUndefined();
  });
});

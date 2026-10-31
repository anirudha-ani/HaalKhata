/**
 * Integration test for the paged lists, against a real Postgres: expense
 * lists, an expense's comments, and the statement with a friend.
 *
 * The rule every list keeps: reading it page by page, at any page size,
 * gives exactly the rows the single read gives, in the same order — none
 * twice, none skipped — including rows written in the same microsecond and
 * ids a database collation would order differently from JavaScript. The
 * statement adds its own: a later page continues the running balance where
 * the last one ended, and refuses rather than continue from a history that
 * has changed since the first page was read.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { ExpenseListPart } from "@haalkhata/protogen/expense/v1/expense_pb";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_pagination_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const READER = "reader-1";
const FRIEND = "friend-1";
const THIRD = "third-1";
const OUTSIDER = "outsider-1";
const BLOCKED = "blocked-1";

/** Page sizes every list is read at. */
const PAGE_SIZES = [1, 2, 3, 5, 7, 50];

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

/** One expense as the fixtures write it. */
interface ExpenseFixture {
  id: string;
  groupId: string | null;
  currency: string;
  date: string;
  createdAt: string;
  payers: [string, number][];
  splits: [string, number][];
  deleted?: boolean;
}

/** One plain payment as the fixtures write it. */
interface PaymentFixture {
  id: string;
  groupId: string | null;
  fromUser: string;
  toUser: string;
  cents: number;
  currency: string;
  createdAt: string;
  deleted?: boolean;
}

describe.skipIf(!reachable)("paged lists, against Postgres", () => {
  let database: Client;
  let expenseUsecase: typeof import("./expense.usecase");
  let balanceUsecase: typeof import("./balance.usecase");
  let closePool: () => Promise<void>;

  /**
   * Writes an expense with its payers and splits.
   *
   * @param fixture - The expense.
   */
  const insertExpense = async (fixture: ExpenseFixture) => {
    const amount = fixture.payers.reduce((total, [, cents]) => total + cents, 0);
    await database.query(
      `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date,
                             split_type, created_by, created_at, deleted_at)
       VALUES ($1, $2, $1, $3, $4, $5, 'exact', $6, $7, $8)`,
      [
        fixture.id,
        fixture.groupId,
        amount,
        fixture.currency,
        fixture.date,
        fixture.payers[0][0],
        fixture.createdAt,
        fixture.deleted ? fixture.createdAt : null,
      ],
    );
    for (const [userId, cents] of fixture.payers) {
      await database.query(
        "INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ($1, $2, $3)",
        [fixture.id, userId, cents],
      );
    }
    for (const [userId, cents] of fixture.splits) {
      await database.query(
        "INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ($1, $2, $3)",
        [fixture.id, userId, cents],
      );
    }
  };

  /**
   * Writes a plain payment.
   *
   * @param fixture - The payment.
   */
  const insertPayment = async (fixture: PaymentFixture) => {
    await database.query(
      `INSERT INTO settlements (id, group_id, from_user, to_user, amount_cents, currency, method,
                                created_at, recorded_by, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'cash', $7, $3, $8)`,
      [
        fixture.id,
        fixture.groupId,
        fixture.fromUser,
        fixture.toUser,
        fixture.cents,
        fixture.currency,
        fixture.createdAt,
        fixture.deleted ? fixture.createdAt : null,
      ],
    );
  };

  /**
   * Reads the whole statement page by page.
   *
   * @param size - Lines per page.
   * @returns Every entry, newest first.
   */
  const statementInPages = async (size: number) => {
    const first = await balanceUsecase.getFriendLedger(READER, FRIEND, size);
    expect(first.truncated).toBe(false);
    expect(first.entries.length).toBeLessThanOrEqual(size);
    const entries = [...first.entries];
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await balanceUsecase.listFriendLedgerEntries(READER, FRIEND, { cursor, limit: size });
      expect(page.entries.length).toBeGreaterThan(0);
      expect(page.entries.length).toBeLessThanOrEqual(size);
      entries.push(...page.entries);
      cursor = page.nextCursor;
    }
    return entries;
  };

  /**
   * Reads an expense list page by page.
   *
   * @param filter - Which list.
   * @param size - Expenses per page.
   * @returns Every expense id, newest first.
   */
  const expenseIdsInPages = async (filter: Parameters<typeof expenseUsecase.listExpenses>[1], size: number) => {
    const expenseIds: string[] = [];
    let cursor = "";
    do {
      const page = await expenseUsecase.listExpenses(READER, filter, { cursor, limit: size });
      expect(page.truncated).toBe(false);
      expect(page.expenses.length).toBeLessThanOrEqual(size);
      expenseIds.push(...page.expenses.map((expense) => expense.id));
      cursor = page.nextCursor;
    } while (cursor);
    return expenseIds;
  };

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    // An ICU en-US database orders "tie-a" before "tie-A" and "_" before
    // "-", unlike a byte comparison, whatever the server's own default is:
    // the statement's ids must still merge in the order JavaScript keeps.
    await admin.query(
      `CREATE DATABASE ${TEST_DATABASE} TEMPLATE template0 LOCALE_PROVIDER icu ICU_LOCALE 'en-US' LOCALE 'C'`,
    );
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
    expenseUsecase = await import("./expense.usecase");
    balanceUsecase = await import("./balance.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub) VALUES
         ($1, 'reader@example.com', 'Rita Reader', '#c73e2e', now(), 'google-reader'),
         ($2, 'friend@example.com', 'Farid Friend', '#0f8a5f', now(), 'google-friend'),
         ($3, 'third@example.com', 'Tara Third', '#2e5bc7', now(), 'google-third'),
         ($4, 'outsider@example.com', 'Omar Outsider', '#7a2ec7', now(), 'google-outsider'),
         ($5, 'blocked@example.com', 'Bea Blocked', '#c79a2e', now(), 'google-blocked')`,
      [READER, FRIEND, THIRD, OUTSIDER, BLOCKED],
    );
    await database.query(
      "INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1)",
      [READER, FRIEND],
    );
    await database.query(
      `INSERT INTO groups (id, name, currency, created_by) VALUES
         ('grp-usd', 'House', 'USD', $1), ('grp-eur', 'Lisbon', 'EUR', $1)`,
      [READER],
    );
    await database.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES
         ('grp-usd', $1, 'owner'), ('grp-usd', $2, 'member'), ('grp-usd', $3, 'member'),
         ('grp-usd', $4, 'member'),
         ('grp-eur', $1, 'owner'), ('grp-eur', $2, 'member')`,
      [READER, FRIEND, THIRD, BLOCKED],
    );

    // A history built to trip every way a page boundary can go wrong.
    const expenses: ExpenseFixture[] = [];
    // Plain lines, a day apart, alternating who paid.
    for (let index = 0; index < 8; index++) {
      const dayOfMonth = String(index + 1).padStart(2, "0");
      const readerPaid = index % 2 === 0;
      expenses.push({
        id: `exp-plain-${dayOfMonth}`,
        groupId: index < 4 ? "grp-usd" : null,
        currency: "USD",
        date: `2026-09-${dayOfMonth}`,
        createdAt: `2026-09-${dayOfMonth}T09:00:00.000000Z`,
        payers: [[readerPaid ? READER : FRIEND, 1000 + index]],
        splits: [[readerPaid ? FRIEND : READER, 1000 + index]],
      });
    }
    // Four written in the same microsecond, with ids that en_US orders
    // differently from a byte comparison.
    for (const tieId of ["tie-A", "tie-a", "tie-b", "tie_B"]) {
      expenses.push({
        id: tieId,
        groupId: "grp-usd",
        currency: "USD",
        date: "2026-09-10",
        createdAt: "2026-09-10T10:00:00.555555Z",
        payers: [[READER, 500]],
        splits: [[FRIEND, 500]],
      });
    }
    // Two in the same millisecond, a few microseconds apart: a Date would
    // read them as one moment.
    expenses.push(
      {
        id: "exp-micro-early",
        groupId: null,
        currency: "USD",
        date: "2026-09-11",
        createdAt: "2026-09-11T10:00:00.123456Z",
        payers: [[FRIEND, 700]],
        splits: [[READER, 700]],
      },
      {
        id: "exp-micro-late",
        groupId: null,
        currency: "USD",
        date: "2026-09-11",
        createdAt: "2026-09-11T10:00:00.123789Z",
        payers: [[READER, 300]],
        splits: [[FRIEND, 300]],
      },
    );
    // A run of expenses both are on that move nothing between them: each
    // owes the third person. They make no line, so a page reads past them.
    for (let index = 0; index < 6; index++) {
      expenses.push({
        id: `exp-quiet-${index}`,
        groupId: "grp-usd",
        currency: "USD",
        date: "2026-09-12",
        createdAt: `2026-09-12T10:00:0${index}.000000Z`,
        payers: [[THIRD, 3000]],
        splits: [[READER, 1000], [FRIEND, 1000], [THIRD, 1000]],
      });
    }
    // Deleted: stays a line, moving nothing.
    expenses.push({
      id: "exp-deleted",
      groupId: "grp-usd",
      currency: "USD",
      date: "2026-09-13",
      createdAt: "2026-09-13T10:00:00.000000Z",
      payers: [[FRIEND, 4200]],
      splits: [[READER, 4200]],
      deleted: true,
    });
    // Another currency, its own running balance.
    for (let index = 0; index < 3; index++) {
      expenses.push({
        id: `exp-euro-${index}`,
        groupId: "grp-eur",
        currency: "EUR",
        date: `2026-09-1${4 + index}`,
        createdAt: `2026-09-1${4 + index}T10:00:00.000000Z`,
        payers: [[FRIEND, 900 + index]],
        splits: [[READER, 900 + index]],
      });
    }
    // An expense and a payment on one day and one moment: the payment sorts
    // after it.
    expenses.push({
      id: "exp-same-moment",
      groupId: null,
      currency: "USD",
      date: "2026-09-18",
      createdAt: "2026-09-18T08:00:00.000001Z",
      payers: [[FRIEND, 2500]],
      splits: [[READER, 2500]],
    });
    for (const expense of expenses) await insertExpense(expense);

    await insertPayment({
      id: "pay-same-moment",
      groupId: null,
      fromUser: READER,
      toUser: FRIEND,
      cents: 2500,
      currency: "USD",
      createdAt: "2026-09-18T08:00:00.000001Z",
    });
    await insertPayment({
      id: "pay-removed",
      groupId: "grp-usd",
      fromUser: FRIEND,
      toUser: READER,
      cents: 600,
      currency: "USD",
      createdAt: "2026-09-19T10:00:00.000000Z",
      deleted: true,
    });
    await insertPayment({
      id: "pay-euro",
      groupId: "grp-eur",
      fromUser: READER,
      toUser: FRIEND,
      cents: 500,
      currency: "EUR",
      createdAt: "2026-09-20T10:00:00.000000Z",
    });

    // One one-off balance each way across two scopes, so a net settlement
    // has something to cancel: the friend owes 30.00 outside groups, the
    // reader owes 20.00 in the house.
    await insertExpense({
      id: "exp-net-one-off",
      groupId: null,
      currency: "USD",
      date: "2026-09-21",
      createdAt: "2026-09-21T10:00:00.000000Z",
      payers: [[READER, 100_000]],
      splits: [[FRIEND, 100_000]],
    });
    await insertExpense({
      id: "exp-net-house",
      groupId: "grp-usd",
      currency: "USD",
      date: "2026-09-22",
      createdAt: "2026-09-22T10:00:00.000000Z",
      payers: [[FRIEND, 100_000]],
      splits: [[READER, 100_000]],
    });
    // Recorded through the usecase so the unit is the real thing: a cash
    // row and the offsets sharing one parent and one moment.
    const ledger = await balanceUsecase.getFriendLedger(FRIEND, READER);
    const position = ledger.settlePositions.find((candidate) => candidate.currency === "USD");
    if (!position || position.netCents >= 0) throw new Error(`fixture: expected the friend to owe, got ${position?.netCents}`);
    await expenseUsecase.recordSettlement(FRIEND, {
      groupId: "",
      toUserId: READER,
      amountCents: -position.netCents,
      currency: "USD",
      method: "cash",
      note: "",
      netAcrossScopes: true,
      positionDigest: position.digest,
      operationId: crypto.randomUUID(),
    } as Parameters<typeof expenseUsecase.recordSettlement>[1]);
    // The friend has since left the house: removing any line of that unit
    // is refused, on every page that shows one.
    await database.query("DELETE FROM group_members WHERE group_id = 'grp-usd' AND user_id = $1", [
      FRIEND,
    ]);

    // Comments, three written in one microsecond, one from a person the
    // reader has blocked.
    const comments: [string, string, string][] = [
      ["cmt-1", READER, "2026-09-02T10:00:00.000001Z"],
      ["cmt-2", FRIEND, "2026-09-02T10:00:00.000002Z"],
      ["cmt-B", READER, "2026-09-02T10:00:00.000003Z"],
      ["cmt-a", FRIEND, "2026-09-02T10:00:00.000003Z"],
      ["cmt-b", READER, "2026-09-02T10:00:00.000003Z"],
      ["cmt-blocked", BLOCKED, "2026-09-02T10:00:00.000004Z"],
      ["cmt-6", FRIEND, "2026-09-02T10:00:00.000005Z"],
      ["cmt-7", READER, "2026-09-02T10:00:00.000006Z"],
    ];
    for (const [commentId, author, createdAt] of comments) {
      await database.query(
        "INSERT INTO comments (id, expense_id, user_id, body, created_at) VALUES ($1, 'exp-plain-01', $2, $1, $3)",
        [commentId, author, createdAt],
      );
    }
    await database.query("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)", [
      READER,
      BLOCKED,
    ]);
  });

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  describe("the statement with a friend", () => {
    it("reads the same lines and balances page by page as in one read, at any page size", async () => {
      const whole = await balanceUsecase.getFriendLedger(READER, FRIEND);
      expect(whole.truncated).toBe(false);
      expect(whole.nextCursor).toBe("");
      for (const size of PAGE_SIZES) {
        expect(await statementInPages(size)).toEqual(whole.entries);
      }
    });

    it("keeps one strict order: moment to the microsecond, payment after expense, ids byte by byte", async () => {
      const lineIds = (await statementInPages(2)).map((entry) => entry.id);
      const tieOrder = lineIds.filter((lineId) => lineId.startsWith("tie"));
      expect(tieOrder).toEqual(["tie_B", "tie-b", "tie-a", "tie-A"]);
      expect(lineIds.indexOf("exp-micro-late")).toBeLessThan(lineIds.indexOf("exp-micro-early"));
      expect(lineIds.indexOf("pay-same-moment")).toBeLessThan(lineIds.indexOf("exp-same-moment"));
      expect(lineIds.some((lineId) => lineId.startsWith("exp-quiet"))).toBe(false);
      expect(new Set(lineIds).size).toBe(lineIds.length);
    });

    it("runs each currency's balance from zero at the oldest line", async () => {
      const entries = await statementInPages(3);
      for (const currency of ["USD", "EUR"]) {
        const column = entries.filter((entry) => entry.currency === currency);
        const oldest = column[column.length - 1];
        expect(oldest.balanceAfterCents).toBe(oldest.deltaCents);
        for (let index = 0; index < column.length - 1; index++) {
          expect(column[index].balanceAfterCents).toBe(
            column[index + 1].balanceAfterCents + column[index].deltaCents,
          );
        }
      }
    });

    it("refuses every line of a net settlement on whichever page it falls", async () => {
      const entries = await statementInPages(1);
      const unit = entries.filter((entry) => entry.netSettlementId !== "");
      expect(unit.length).toBeGreaterThan(1);
      for (const line of unit) expect(line.removalRefusal).not.toBe("");
    });

    it("refuses a cursor that was altered, or made for someone else's statement", async () => {
      const { nextCursor } = await balanceUsecase.getFriendLedger(READER, FRIEND, 2);
      const [payload, signature] = nextCursor.split(".");
      const altered = `${payload.slice(0, -2)}${payload.endsWith("A") ? "B" : "A"}${payload.slice(-1)}.${signature}`;
      for (const [reader, friend, cursor] of [
        [READER, FRIEND, altered],
        [READER, FRIEND, "not-a-cursor"],
        [FRIEND, READER, nextCursor],
        [READER, THIRD, nextCursor],
      ]) {
        await expect(
          balanceUsecase.listFriendLedgerEntries(reader, friend, { cursor, limit: 2 }),
        ).rejects.toMatchObject({ code: "invalid_argument" });
      }
    });

    it("refuses to continue once a line has changed, and not for words alone", async () => {
      const { nextCursor } = await balanceUsecase.getFriendLedger(READER, FRIEND, 2);
      const next = () => balanceUsecase.listFriendLedgerEntries(READER, FRIEND, { cursor: nextCursor, limit: 2 });

      // A description moves no money: the page still continues.
      await database.query("UPDATE expenses SET description = 'Groceries' WHERE id = 'exp-plain-02'");
      await expect(next()).resolves.toMatchObject({ entries: expect.any(Array) });

      // A share moved on an old line: every balance after it moved too.
      await database.query(
        "UPDATE expense_payers SET amount_cents = 999 WHERE expense_id = 'exp-plain-02'",
      );
      await database.query(
        "UPDATE expense_splits SET owed_cents = 999 WHERE expense_id = 'exp-plain-02'",
      );
      await expect(next()).rejects.toMatchObject({ code: "failed_precondition" });
      await database.query(
        "UPDATE expense_payers SET amount_cents = 1001 WHERE expense_id = 'exp-plain-02'",
      );
      await database.query(
        "UPDATE expense_splits SET owed_cents = 1001 WHERE expense_id = 'exp-plain-02'",
      );
      await expect(next()).resolves.toMatchObject({ entries: expect.any(Array) });

      // Deleting an old line, or writing one into the past, is a change too.
      await database.query("UPDATE expenses SET deleted_at = now() WHERE id = 'exp-plain-03'");
      await expect(next()).rejects.toMatchObject({ code: "failed_precondition" });
      await database.query("UPDATE expenses SET deleted_at = NULL WHERE id = 'exp-plain-03'");
      await insertExpense({
        id: "exp-backdated",
        groupId: null,
        currency: "USD",
        date: "2026-08-01",
        createdAt: "2026-10-01T10:00:00.000000Z",
        payers: [[READER, 100]],
        splits: [[FRIEND, 100]],
      });
      await expect(next()).rejects.toMatchObject({ code: "failed_precondition" });

      // A statement read afresh pages again, and still adds up.
      const whole = await balanceUsecase.getFriendLedger(READER, FRIEND);
      expect(await statementInPages(4)).toEqual(whole.entries);
    });
  });

  describe("expense lists", () => {
    it("pages a group's, a pair's one-off, and a person's whole list without gaps or repeats", async () => {
      for (const filter of [
        { groupId: "grp-usd" },
        { withUserId: FRIEND },
        {},
        { part: ExpenseListPart.ONE_OFF },
        { part: ExpenseListPart.GROUP, partGroupId: "grp-eur" },
      ]) {
        const whole = await expenseUsecase.listExpenses(READER, filter, { cursor: "", limit: 0 });
        expect(whole.truncated).toBe(false);
        const wholeIds = whole.expenses.map((expense) => expense.id);
        expect(wholeIds.length).toBeGreaterThanOrEqual(3);
        for (const size of PAGE_SIZES) {
          expect(await expenseIdsInPages(filter, size)).toEqual(wholeIds);
        }
      }
    });

    it("narrows the caller's own list on the server: one-off only, or one group's they are on", async () => {
      const everything = (await expenseUsecase.listExpenses(READER, {}, { cursor: "", limit: 0 })).expenses;
      const oneOffIds = new Set(everything.filter((expense) => expense.groupId === "").map((expense) => expense.id));
      const oneOff = await expenseIdsInPages({ part: ExpenseListPart.ONE_OFF }, 2);
      const euroTrip = await expenseIdsInPages({ part: ExpenseListPart.GROUP, partGroupId: "grp-eur" }, 2);
      expect(oneOff.length).toBeGreaterThan(3);
      expect(oneOff).toEqual(everything.flatMap((expense) => (oneOffIds.has(expense.id) ? [expense.id] : [])));
      expect(euroTrip).toEqual(["exp-euro-2", "exp-euro-1", "exp-euro-0"]);
      // The third person's quiet expenses are in the house, but the reader's
      // part of the house holds them only because the reader is on them.
      const house = await expenseIdsInPages({ part: ExpenseListPart.GROUP, partGroupId: "grp-usd" }, 3);
      expect(house).toContain("exp-quiet-0");
      expect(house.some((expenseId) => oneOffIds.has(expenseId))).toBe(false);
    });

    it("refuses a part that does not fit the rest of the request", async () => {
      for (const filter of [
        { groupId: "grp-usd", part: ExpenseListPart.ONE_OFF },
        { part: ExpenseListPart.GROUP },
        { part: ExpenseListPart.ONE_OFF, partGroupId: "grp-usd" },
        { part: 99 as ExpenseListPart },
      ]) {
        await expect(
          expenseUsecase.listExpenses(READER, filter, { cursor: "", limit: 5 }),
        ).rejects.toMatchObject({ code: "invalid_argument" });
      }
    });

    it("lists deleted expenses, and every expense written in one microsecond", async () => {
      const expenseIds = await expenseIdsInPages({ groupId: "grp-usd" }, 1);
      expect(expenseIds).toContain("exp-deleted");
      expect(expenseIds.filter((expenseId) => expenseId.startsWith("tie")).sort()).toEqual([
        "tie-A",
        "tie-a",
        "tie-b",
        "tie_B",
      ]);
    });

    it("refuses a cursor that is not one of its own", async () => {
      for (const cursor of ["not-a-cursor", Buffer.from(JSON.stringify(["2026-09-01", "yesterday", "x"])).toString("base64url")]) {
        await expect(
          expenseUsecase.listExpenses(READER, { groupId: "grp-usd" }, { cursor, limit: 5 }),
        ).rejects.toMatchObject({ code: "invalid_argument" });
      }
    });
  });

  describe("comments", () => {
    it("pages back through a thread to exactly the comments one read gives", async () => {
      const whole = (await expenseUsecase.getExpense(READER, "exp-plain-01")).comments.map((comment) => comment.id);
      // Oldest first; the three written in one microsecond in the database's
      // own id order, which the pages keep too. The blocked person's is left out.
      expect(whole.slice(0, 2)).toEqual(["cmt-1", "cmt-2"]);
      expect(whole.slice(2, 5).sort()).toEqual(["cmt-B", "cmt-a", "cmt-b"]);
      expect(whole.slice(5)).toEqual(["cmt-6", "cmt-7"]);
      for (const size of PAGE_SIZES) {
        const first = await expenseUsecase.getExpense(READER, "exp-plain-01", size);
        const pages = [first.comments.map((comment) => comment.id)];
        let cursor = first.commentsNextCursor;
        while (cursor) {
          const page = await expenseUsecase.listComments(READER, "exp-plain-01", { cursor, limit: size });
          expect(page.comments.length).toBeLessThanOrEqual(size);
          pages.unshift(page.comments.map((comment) => comment.id));
          cursor = page.nextCursor;
        }
        expect(pages.flat()).toEqual(whole);
      }
    });

    it("is closed to someone who cannot see the expense, and refuses a foreign cursor", async () => {
      await expect(
        expenseUsecase.listComments(OUTSIDER, "exp-plain-01", { cursor: "", limit: 5 }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/permission_denied|not_found/) });
      await expect(
        expenseUsecase.listComments(READER, "exp-plain-01", { cursor: "not-a-cursor", limit: 5 }),
      ).rejects.toMatchObject({ code: "invalid_argument" });
    });
  });
});

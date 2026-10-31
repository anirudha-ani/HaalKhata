/**
 * Integration test for payment methods, run against a real Postgres.
 *
 * The unit tests prove the decisions with mocks and never execute a
 * statement. This suite runs the migration and the real SQL, and checks the
 * three things only a database can: that details come back in the owner's
 * order, that a person's saves take turns (the cap and the one star per
 * currency both hold under concurrent writes), and that the schema itself
 * refuses what the validator would have refused.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type PoolClient } from "pg";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_payment_methods_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const OWNER = "owner-1";
const STRANGER = "stranger-1";
const HOARDER = "hoarder-1";
const LEAVER = "leaver-1";
const RACER = "racer-1";
const MARKER = "marker-1";

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
 * Builds a create request for a wallet reached by phone.
 *
 * @param name - Method name.
 * @param currency - ISO 4217 code, or "" for any currency.
 * @param preferred - Whether to star it.
 * @returns The request body.
 */
function wallet(name: string, currency: string, preferred = false) {
  return {
    name,
    currency,
    preset: "",
    details: [{ kind: "phone", label: "", value: "+8801712345678" }],
    note: "",
    preferred,
  };
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("payment methods against Postgres", () => {
  let database: Client;
  let usecase: typeof import("./paymentMethod.usecase");
  let closePool: () => Promise<void>;

  /**
   * Reads the names of a person's starred methods with their currency bucket.
   *
   * @param userId - Owner of the methods.
   * @returns "name:currency" for each starred method, sorted.
   */
  async function starred(userId: string): Promise<string[]> {
    const { methods } = await usecase.listMyPaymentMethods(userId);
    return methods
      .filter((method) => method.preferred)
      .map((method) => `${method.name}:${method.currency}`)
      .sort();
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
    usecase = await import("./paymentMethod.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub) VALUES
         ($1, 'owner@example.com', 'Olive Owner', '#c73e2e', now(), 'google-owner'),
         ($2, 'stranger@example.com', 'Sam Stranger', '#0f8a5f', now(), 'google-stranger'),
         ($3, 'hoarder@example.com', 'Hal Hoarder', '#b45309', now(), 'google-hoarder'),
         ($4, 'leaver@example.com', 'Lee Leaver', '#1d4ed8', now(), 'google-leaver')`,
      [OWNER, STRANGER, HOARDER, LEAVER],
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

  it("stores a bank method and hands its details back in the owner's order", async () => {
    const created = await usecase.createPaymentMethod(OWNER, {
      name: "Chase checking",
      currency: "USD",
      preset: "",
      details: [
        { kind: "account_name", label: "", value: "Olive Owner" },
        { kind: "bank_name", label: "", value: "" },
        { kind: "account_type", label: "", value: "checking" },
        { kind: "account_number", label: "", value: "000123454821" },
        { kind: "custom", label: "Branch", value: "Downtown" },
      ],
      note: "Reference: your name",
      preferred: false,
    });

    expect(created).toMatchObject({
      name: "Chase checking",
      currency: "USD",
      preset: "",
      note: "Reference: your name",
      preferred: false,
      details: [
        { kind: "account_name", label: "", value: "Olive Owner" },
        { kind: "account_type", label: "", value: "checking" },
        { kind: "account_number", label: "", value: "000123454821" },
        { kind: "custom", label: "Branch", value: "Downtown" },
      ],
    });
    expect(created.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    const { rows } = await database.query(
      `SELECT position, kind FROM payment_method_details WHERE method_id = $1 ORDER BY position`,
      [created.id],
    );
    expect(rows).toEqual([
      { position: 0, kind: "account_name" },
      { position: 1, kind: "account_type" },
      { position: 2, kind: "account_number" },
      { position: 3, kind: "custom" },
    ]);
  });

  it("lists a person's methods oldest first and nobody else's", async () => {
    await usecase.createPaymentMethod(OWNER, wallet("bKash", "BDT"));
    await usecase.createPaymentMethod(STRANGER, wallet("Nagad", "BDT"));

    const mine = await usecase.listMyPaymentMethods(OWNER);
    expect(mine.methods.map((method) => method.name)).toEqual(["Chase checking", "bKash"]);
    const theirs = await usecase.listMyPaymentMethods(STRANGER);
    expect(theirs.methods.map((method) => method.name)).toEqual(["Nagad"]);
  });

  it("refuses to edit, star or delete somebody else's method", async () => {
    const [bkash] = (await usecase.listMyPaymentMethods(OWNER)).methods.filter(
      (method) => method.name === "bKash",
    );

    await expect(
      usecase.updatePaymentMethod(STRANGER, { ...wallet("Mine now", "BDT"), id: bkash!.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      usecase.setPreferredPaymentMethod(STRANGER, { id: bkash!.id, preferred: true }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(usecase.deletePaymentMethod(STRANGER, bkash!.id)).rejects.toMatchObject({
      code: "not_found",
    });

    const after = (await usecase.listMyPaymentMethods(OWNER)).methods.find(
      (method) => method.id === bkash!.id,
    );
    expect(after).toMatchObject({ name: "bKash", preferred: false });
  });

  it("keeps one star per currency, with any-currency as a bucket of its own", async () => {
    const nagad = await usecase.createPaymentMethod(OWNER, wallet("Nagad", "BDT", true));
    expect(await starred(OWNER)).toEqual(["Nagad:BDT"]);

    const bkash = (await usecase.listMyPaymentMethods(OWNER)).methods.find(
      (method) => method.name === "bKash",
    )!;
    const afterStar = await usecase.setPreferredPaymentMethod(OWNER, {
      id: bkash.id,
      preferred: true,
    });
    expect(afterStar.methods.find((method) => method.id === nagad.id)?.preferred).toBe(false);
    expect(await starred(OWNER)).toEqual(["bKash:BDT"]);

    // Another currency and the any-currency bucket each keep their own star.
    const chase = afterStar.methods.find((method) => method.name === "Chase checking")!;
    await usecase.setPreferredPaymentMethod(OWNER, { id: chase.id, preferred: true });
    await usecase.createPaymentMethod(OWNER, {
      name: "PayPal",
      currency: "",
      preset: "paypal",
      details: [{ kind: "username", label: "", value: "https://paypal.me/oliveowner" }],
      note: "",
      preferred: true,
    });
    expect(await starred(OWNER)).toEqual(["Chase checking:USD", "PayPal:", "bKash:BDT"]);

    await usecase.setPreferredPaymentMethod(OWNER, { id: chase.id, preferred: false });
    expect(await starred(OWNER)).toEqual(["PayPal:", "bKash:BDT"]);
  });

  it("stores a built-in app's handle bare", async () => {
    const paypal = (await usecase.listMyPaymentMethods(OWNER)).methods.find(
      (method) => method.preset === "paypal",
    );
    expect(paypal?.details).toEqual([{ kind: "username", label: "", value: "oliveowner" }]);
  });

  it("carries a starred method into a currency that already has a star", async () => {
    const methods = (await usecase.listMyPaymentMethods(OWNER)).methods;
    const bkash = methods.find((method) => method.name === "bKash")!;
    const chase = methods.find((method) => method.name === "Chase checking")!;
    await usecase.setPreferredPaymentMethod(OWNER, { id: chase.id, preferred: true });

    // bKash is starred for BDT and Chase for USD. Moving bKash to USD with
    // its star must take USD's star, not trip the unique index.
    const moved = await usecase.updatePaymentMethod(OWNER, {
      id: bkash.id,
      name: "bKash",
      currency: "USD",
      details: bkash.details,
      note: "",
      preferred: true,
    });
    expect(moved).toMatchObject({ currency: "USD", preferred: true });
    expect(await starred(OWNER)).toEqual(["PayPal:", "bKash:USD"]);

    await usecase.updatePaymentMethod(OWNER, {
      id: bkash.id,
      name: "bKash",
      currency: "BDT",
      details: bkash.details,
      note: "",
      preferred: true,
    });
    expect(await starred(OWNER)).toEqual(["PayPal:", "bKash:BDT"]);
  });

  it("moves the changed-at stamp for a new detail and not for a star or an untouched save", async () => {
    const bkash = (await usecase.listMyPaymentMethods(OWNER)).methods.find(
      (method) => method.name === "bKash",
    )!;
    const unchanged = {
      id: bkash.id,
      name: bkash.name,
      currency: bkash.currency,
      details: bkash.details,
      note: bkash.note,
      preferred: bkash.preferred,
    };

    const resaved = await usecase.updatePaymentMethod(OWNER, unchanged);
    expect(resaved.updatedAt).toBe(bkash.updatedAt);

    const unstarred = await usecase.updatePaymentMethod(OWNER, { ...unchanged, preferred: false });
    expect(unstarred.updatedAt).toBe(bkash.updatedAt);
    await usecase.setPreferredPaymentMethod(OWNER, { id: bkash.id, preferred: true });

    const edited = await usecase.updatePaymentMethod(OWNER, {
      ...unchanged,
      details: [
        { kind: "phone", label: "", value: "+8801812345678" },
        { kind: "custom", label: "Account type", value: "Personal" },
      ],
      note: "Use Send Money, not Payment",
    });
    expect(Date.parse(edited.updatedAt)).toBeGreaterThan(Date.parse(bkash.updatedAt));
    expect(edited.details).toEqual([
      { kind: "phone", label: "", value: "+8801812345678" },
      { kind: "custom", label: "Account type", value: "Personal" },
    ]);
    expect(edited.preferred).toBe(true);
  });

  it("deletes a method together with its details", async () => {
    const nagad = (await usecase.listMyPaymentMethods(OWNER)).methods.find(
      (method) => method.name === "Nagad",
    )!;

    await usecase.deletePaymentMethod(OWNER, nagad.id);

    const { rows } = await database.query(
      `SELECT COUNT(*)::int AS total FROM payment_method_details WHERE method_id = $1`,
      [nagad.id],
    );
    expect(rows[0].total).toBe(0);
    await expect(usecase.deletePaymentMethod(OWNER, nagad.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("holds the cap at twelve when saves race", async () => {
    // Twenty at once: without the per-person lock every one of them reads a
    // count below the cap before any has inserted.
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_unused, index) =>
        usecase.createPaymentMethod(HOARDER, wallet(`Wallet ${index}`, "BDT")),
      ),
    );

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(12);
    for (const attempt of attempts) {
      if (attempt.status === "rejected") {
        expect(attempt.reason).toMatchObject({ code: "failed_precondition" });
      }
    }
    expect((await usecase.listMyPaymentMethods(HOARDER)).methods).toHaveLength(12);
  });

  it("leaves exactly one star when every method is starred at once", async () => {
    const { methods } = await usecase.listMyPaymentMethods(HOARDER);

    await Promise.all(
      methods.map((method) =>
        usecase.setPreferredPaymentMethod(HOARDER, { id: method.id, preferred: true }),
      ),
    );

    expect(await starred(HOARDER)).toHaveLength(1);
  });

  it("removes a person's methods when their account is deleted", async () => {
    const created = await usecase.createPaymentMethod(LEAVER, wallet("bKash", "BDT", true));

    await database.query(`DELETE FROM users WHERE id = $1`, [LEAVER]);

    const { rows } = await database.query(
      `SELECT (SELECT COUNT(*)::int FROM payment_methods WHERE id = $1) AS methods,
              (SELECT COUNT(*)::int FROM payment_method_details WHERE method_id = $1) AS details`,
      [created.id],
    );
    expect(rows[0]).toEqual({ methods: 0, details: 0 });
  });

  it("has the schema refuse what the validator refuses", async () => {
    const insertMethod = (overrides: Record<string, unknown>) => {
      const values = {
        id: `raw-${Math.random()}`,
        name: "Raw",
        currency: "USD",
        preset: null,
        note: "",
        is_preferred: false,
        ...overrides,
      };
      return database.query(
        `INSERT INTO payment_methods (id, user_id, name, currency, preset, note, is_preferred)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          values.id,
          STRANGER,
          values.name,
          values.currency,
          values.preset,
          values.note,
          values.is_preferred,
        ],
      );
    };

    await expect(insertMethod({ name: "" })).rejects.toMatchObject({ code: "23514" });
    await expect(insertMethod({ name: "x".repeat(41) })).rejects.toMatchObject({ code: "23514" });
    await expect(insertMethod({ currency: "usd" })).rejects.toMatchObject({ code: "23514" });
    await expect(insertMethod({ preset: "carrier-pigeon" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(insertMethod({ note: "x".repeat(201) })).rejects.toMatchObject({ code: "23514" });

    // Two stars in one currency bucket, written behind the usecase's back.
    await insertMethod({ id: "raw-star-1", is_preferred: true });
    await expect(insertMethod({ id: "raw-star-2", is_preferred: true })).rejects.toMatchObject({
      code: "23505",
      constraint: "uq_payment_methods_preferred",
    });
    await insertMethod({ id: "raw-any-1", currency: null, is_preferred: true });
    await expect(
      insertMethod({ id: "raw-any-2", currency: null, is_preferred: true }),
    ).rejects.toMatchObject({ code: "23505" });

    const insertDetail = (position: number, kind: string, label: string, value: string) =>
      database.query(
        `INSERT INTO payment_method_details (method_id, position, kind, label, value)
         VALUES ('raw-star-1', $1, $2, $3, $4)`,
        [position, kind, label, value],
      );
    await expect(insertDetail(0, "card_number", "", "4111")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(insertDetail(8, "phone", "", "+8801712345678")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(insertDetail(0, "phone", "", "")).rejects.toMatchObject({ code: "23514" });
    await expect(insertDetail(0, "custom", "x".repeat(31), "value")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(insertDetail(0, "link", "", `https://example.com/${"x".repeat(300)}`)).rejects.toMatchObject({
      code: "23514",
    });
    await insertDetail(0, "phone", "", "+8801712345678");
  });

  it("an edit and a removal of the same method at the same moment never fail, whichever wins", async () => {
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
       VALUES ($1, 'racer@example.com', 'Rae Racer', '#7c3aed', now(), 'google-racer')`,
      [RACER],
    );
    const created = await Promise.all(
      Array.from({ length: 8 }, (_unused, index) =>
        usecase.createPaymentMethod(RACER, wallet(`Race ${index}`, "BDT")),
      ),
    );
    const outcomes = await Promise.allSettled(
      created.flatMap((method) => [
        usecase.updatePaymentMethod(RACER, {
          ...wallet("Edited", "EUR", true),
          id: method.id,
          note: "edited",
        }),
        usecase.deletePaymentMethod(RACER, method.id),
      ]),
    );
    // Every removal goes through. Each edit either landed before its
    // removal or found the method gone; nothing ends as a server failure.
    const refused = outcomes.flatMap((outcome) =>
      outcome.status === "rejected" ? [(outcome.reason as { code?: string }).code] : [],
    );
    expect(refused.every((code) => code === "not_found")).toBe(true);
    expect(outcomes.filter((outcome, index) => index % 2 === 1 && outcome.status === "fulfilled")).toHaveLength(8);
    expect((await usecase.listMyPaymentMethods(RACER)).methods).toEqual([]);
  });

  it("removing or editing a method copied from an old handle removes that handle too", async () => {
    const derivedId = async (method: string) =>
      (
        await database.query<{ id: string }>(
          `SELECT md5('payment-handle:' || $1 || ':' || $2)::uuid::text AS id`,
          [STRANGER, method],
        )
      ).rows[0]!.id;
    const handles = async () =>
      (
        await database.query<{ user_id: string; method: string }>(
          `SELECT user_id, method FROM payment_handles ORDER BY user_id, method`,
        )
      ).rows.map((handle) => `${handle.user_id}:${handle.method}`);

    await database.query(
      `INSERT INTO payment_handles (user_id, method, handle) VALUES
         ($1, 'venmo', 'sam-stranger'), ($1, 'paypal', 'samstranger'), ($2, 'venmo', 'olive-owner')`,
      [STRANGER, OWNER],
    );
    for (const method of ["venmo", "paypal"]) {
      await database.query(
        `WITH made AS (
           INSERT INTO payment_methods (id, user_id, name, currency, preset)
           VALUES ($1, $2, $3, $4, $5) RETURNING id
         )
         INSERT INTO payment_method_details (method_id, position, kind, value)
         SELECT id, 0, 'username', $6 FROM made`,
        [
          await derivedId(method),
          STRANGER,
          method === "venmo" ? "Venmo" : "PayPal",
          method === "venmo" ? "USD" : null,
          method,
          method === "venmo" ? "sam-stranger" : "samstranger",
        ],
      );
    }

    await usecase.deletePaymentMethod(STRANGER, await derivedId("venmo"));
    expect(await handles()).toEqual([`${OWNER}:venmo`, `${STRANGER}:paypal`]);

    await usecase.updatePaymentMethod(STRANGER, {
      id: await derivedId("paypal"),
      name: "PayPal",
      currency: "",
      details: [{ kind: "username", label: "", value: "samstranger2" }],
      note: "",
      preferred: false,
    });
    // Only the handle that method came from; another person's is untouched.
    expect(await handles()).toEqual([`${OWNER}:venmo`]);
  });

  it("dates a star when it is given, keeps the date through an edit, and remembers a removal", async () => {
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
       VALUES ($1, 'marker@example.com', 'Mo Marker', '#0e7490', now(), 'google-marker')`,
      [MARKER],
    );
    const snapshot = database as unknown as PoolClient;

    const first = await usecase.createPaymentMethod(MARKER, wallet("First", "BDT", true));
    expect(first.preferredAt).not.toBe("");

    // Re-saved with its star: the details changed, the star did not.
    const renamed = await usecase.updatePaymentMethod(MARKER, {
      ...wallet("First renamed", "BDT", true),
      id: first.id,
    });
    expect(renamed.preferredAt).toBe(first.preferredAt);
    expect(Date.parse(renamed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.updatedAt));

    const second = await usecase.createPaymentMethod(MARKER, wallet("Second", "BDT"));
    expect(second.preferredAt).toBe("");

    // The star moves: the old holder loses its date, the new one gets one.
    const moved = await usecase.setPreferredPaymentMethod(MARKER, { id: second.id, preferred: true });
    const byName = new Map(moved.methods.map((method) => [method.name, method]));
    expect(byName.get("First renamed")?.preferredAt).toBe("");
    const starredAt = byName.get("Second")?.preferredAt ?? "";
    expect(starredAt).not.toBe("");

    // Starring it again is not a new star.
    const again = await usecase.setPreferredPaymentMethod(MARKER, { id: second.id, preferred: true });
    expect(again.methods.find((method) => method.name === "Second")?.preferredAt).toBe(starredAt);

    // Giving the star up clears its date; the database insists on that.
    const cleared = await usecase.setPreferredPaymentMethod(MARKER, { id: second.id, preferred: false });
    expect(cleared.methods.every((method) => method.preferredAt === "")).toBe(true);
    await expect(
      database.query(`UPDATE payment_methods SET preferred_at = now() WHERE id = $1`, [second.id]),
    ).rejects.toMatchObject({ code: "23514" });

    expect((await usecase.listPayeeMethods(MARKER, snapshot)).removedAt).toBe("");
    await usecase.deletePaymentMethod(MARKER, first.id);
    const afterFirst = (await usecase.listPayeeMethods(MARKER, snapshot)).removedAt;
    expect(afterFirst).not.toBe("");
    // A later removal moves the one remembered time forward; it does not add a row.
    await usecase.deletePaymentMethod(MARKER, second.id);
    const afterSecond = (await usecase.listPayeeMethods(MARKER, snapshot)).removedAt;
    expect(Date.parse(afterSecond)).toBeGreaterThanOrEqual(Date.parse(afterFirst));
    const { rows } = await database.query(
      `SELECT count(*)::int AS total FROM payment_method_removals WHERE user_id = $1`,
      [MARKER],
    );
    expect(rows[0].total).toBe(1);
  });
});

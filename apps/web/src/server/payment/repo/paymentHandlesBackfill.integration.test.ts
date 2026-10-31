/**
 * Integration test for the migration that copies payment handles into
 * payment methods, run against a real Postgres.
 *
 * A migration runs once, on production data, with nobody watching. The
 * harness migrates an empty database, where this one has nothing to copy,
 * so the suite seeds handles the way old rows really look (sigils, pasted
 * addresses, blanks, values no screen could have written) and then runs the
 * migration's own SQL over them: up, up again, and down.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { checkPaymentMethod } from "@haalkhata/shared/payment/validateMethod";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_handles_backfill_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

/** The migration under test, read from disk so the test runs what ships. */
const MIGRATION_SQL = readFileSync(
  fileURLToPath(
    new URL("../../../../migrations/1791655028421_backfill-payment-methods.sql", import.meta.url),
  ),
  "utf8",
);
const [UP_SQL, DOWN_SQL] = MIGRATION_SQL.split("-- Down Migration");

const TIDY = "tidy-1";
const MESSY = "messy-1";
const STRAY = "stray-1";
const TIDY_SINCE = "2026-07-04T12:00:00.000Z";

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

describe.skipIf(!reachable)("payment handles backfill against Postgres", () => {
  let database: Client;
  let usecase: typeof import("@/server/payment/usecase/paymentMethod.usecase");
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
    usecase = await import("@/server/payment/usecase/paymentMethod.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub, created_at) VALUES
         ($1, 'tidy@example.com', 'Tia Tidy', '#c73e2e', now(), 'google-tidy', $4),
         ($2, 'messy@example.com', 'Max Messy', '#0f8a5f', now(), 'google-messy', now()),
         ($3, 'odd@example.com', 'Odd One', '#b45309', now(), 'google-odd', now())`,
      [TIDY, MESSY, STRAY, TIDY_SINCE],
    );
    await database.query(
      `INSERT INTO payment_handles (user_id, method, handle) VALUES
         -- Inserted out of order on purpose: the copy must restore the order
         -- the account page always listed them in.
         ($1, 'paypal', 'https://www.paypal.me/tiatidy/'),
         ($1, 'cashapp', '$tiatidy'),
         ($1, 'zelle', 'tia@example.com'),
         ($1, 'venmo', ' @tia-tidy '),
         ($2, 'zelle', '+14155552671'),
         ($2, 'venmo', '   '),
         ($2, 'cashapp', '$'),
         ($2, 'paypal', 'paypal.me/'),
         ($3, 'other', 'ask me in person'),
         ($3, 'bank', '  Example Bank 0001234  '),
         ($3, 'cash', $4)`,
      [TIDY, MESSY, STRAY, "x".repeat(200)],
    );
    await database.query(UP_SQL!);
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("copies the four apps as presets, bare, in the order they were always listed", async () => {
    const { methods } = await usecase.listMyPaymentMethods(TIDY);

    expect(
      methods.map((method) => ({
        name: method.name,
        currency: method.currency,
        preset: method.preset,
        details: method.details,
      })),
    ).toEqual([
      {
        name: "Venmo",
        currency: "USD",
        preset: "venmo",
        details: [{ kind: "username", label: "", value: "tia-tidy" }],
      },
      {
        name: "Zelle",
        currency: "USD",
        preset: "zelle",
        details: [{ kind: "email", label: "", value: "tia@example.com" }],
      },
      {
        name: "Cash App",
        currency: "USD",
        preset: "cashapp",
        details: [{ kind: "username", label: "", value: "tiatidy" }],
      },
      {
        // PayPal moves most currencies, so it is not pinned to dollars.
        name: "PayPal",
        currency: "",
        preset: "paypal",
        details: [{ kind: "username", label: "", value: "tiatidy" }],
      },
    ]);
  });

  it("stars nothing and does not date the copy as a recent change", async () => {
    const { methods } = await usecase.listMyPaymentMethods(TIDY);

    expect(methods.some((method) => method.preferred)).toBe(false);
    // A payer is warned about details that changed in the last two weeks.
    // A copy is not a change: each method is dated from its owner's account.
    expect(methods.map((method) => method.updatedAt)).toEqual(methods.map(() => TIDY_SINCE));
  });

  it("produces methods the form can save again without complaint", async () => {
    const { methods } = await usecase.listMyPaymentMethods(TIDY);

    for (const method of methods) {
      expect(checkPaymentMethod(method).errors, method.name).toEqual({ detailRows: {} });
    }
  });

  it("files a Zelle phone as a phone, and skips handles that were never one", async () => {
    const { methods } = await usecase.listMyPaymentMethods(MESSY);

    // Blank, a lone "$" and a bare "paypal.me/" carry nothing to copy.
    expect(methods).toMatchObject([
      {
        name: "Zelle",
        preset: "zelle",
        details: [{ kind: "phone", label: "", value: "+14155552671" }],
      },
    ]);
    expect(methods).toHaveLength(1);
  });

  it("keeps handles no screen could have written as free text, capped", async () => {
    const { methods } = await usecase.listMyPaymentMethods(STRAY);

    expect(
      methods.map((method) => [method.name, method.preset, method.currency, method.details]),
    ).toEqual([
      ["Bank transfer", "", "", [{ kind: "custom", label: "Details", value: "Example Bank 0001234" }]],
      ["Cash", "", "", [{ kind: "custom", label: "Details", value: "x".repeat(120) }]],
      ["Other", "", "", [{ kind: "custom", label: "Details", value: "ask me in person" }]],
    ]);
  });

  it("changes nothing when it runs a second time", async () => {
    const before = await database.query(
      `SELECT (SELECT COUNT(*)::int FROM payment_methods) AS methods,
              (SELECT COUNT(*)::int FROM payment_method_details) AS details`,
    );

    await database.query(UP_SQL!);

    const after = await database.query(
      `SELECT (SELECT COUNT(*)::int FROM payment_methods) AS methods,
              (SELECT COUNT(*)::int FROM payment_method_details) AS details`,
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(after.rows[0]).toEqual({ methods: 8, details: 8 });
  });

  it("leaves the handles where they were", async () => {
    const { rows } = await database.query(`SELECT COUNT(*)::int AS total FROM payment_handles`);
    expect(rows[0].total).toBe(11);
  });

  it("undoes only its own copies, keeping what people added since", async () => {
    await usecase.createPaymentMethod(TIDY, {
      name: "bKash",
      currency: "BDT",
      preset: "",
      details: [{ kind: "phone", label: "", value: "+8801712345678" }],
      note: "",
      preferred: true,
    });

    await database.query(DOWN_SQL!);

    const { rows } = await database.query(
      `SELECT method.name, COUNT(detail.method_id)::int AS details
         FROM payment_methods method
         LEFT JOIN payment_method_details detail ON detail.method_id = method.id
        GROUP BY method.name`,
    );
    expect(rows).toEqual([{ name: "bKash", details: 1 }]);
    const handles = await database.query(`SELECT COUNT(*)::int AS total FROM payment_handles`);
    expect(handles.rows[0].total).toBe(11);
  });
});

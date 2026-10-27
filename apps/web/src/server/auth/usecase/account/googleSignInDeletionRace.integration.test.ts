/**
 * Real PostgreSQL regression for the remainder of audit A18: a Google
 * sign-in that finds an account by email while that account is being
 * deleted must not fail, and must not hand out a session for the deleted
 * row. It signs the person up afresh, as it would a moment later.
 */

import { Client, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const { verifyIdTokenMock } = vi.hoisted(() => {
  process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";
  process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
  return { verifyIdTokenMock: vi.fn() };
});

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    /** Delegates to the shared spy so each test scripts the verified claims. */
    verifyIdToken(options: unknown) {
      return verifyIdTokenMock(options);
    }
  },
}));

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_google_deletion_race_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const ANA_ID = "race-ana";
const ANA_EMAIL = "ana@example.com";
const GOOGLE_SUB = "google-sub-ana";

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

describe.skipIf(!reachable)("a Google sign-in racing the deletion of the account it found", () => {
  let database: Client;
  let auth: typeof import("./auth.usecase");
  let deletion: typeof import("@/server/auth/repo/deletion/accountDeletion.repo");
  let verifyToken: typeof import("../session/session").verifyToken;
  let closePool: () => Promise<void>;

  /**
   * Issues a server nonce and makes Google's verifier vouch for Ana with it,
   * the way a real sign-in reaches logInWithGoogle.
   */
  async function googleVouchesForAna(): Promise<void> {
    const { nonce } = await auth.beginGoogleSignIn();
    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({ sub: GOOGLE_SUB, email: ANA_EMAIL, email_verified: true, name: "Ana", nonce }),
    });
  }

  /**
   * Polls until a server statement waits on a row another transaction holds.
   *
   * @returns A promise resolving once one waits; throws on timeout.
   */
  async function waitForRowWaiter(): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const waiting = await database.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM pg_locks WHERE locktype = 'transactionid' AND NOT granted",
      );
      if (waiting.rows[0].total >= 1) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("expected the sign-in to wait on the account being deleted");
  }

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
    auth = await import("./auth.usecase");
    deletion = await import("@/server/auth/repo/deletion/accountDeletion.repo");
    ({ verifyToken } = await import("../session/session"));
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
  }, 60_000);

  beforeEach(async () => {
    await database.query("DELETE FROM users");
    await database.query(
      "INSERT INTO users (id, email, name, avatar_color, password_hash) VALUES ($1, $2, 'Ana', '#336699', 'salt:hash')",
      [ANA_ID, ANA_EMAIL],
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

  it("links Google to the live account that holds the email", async () => {
    await googleVouchesForAna();

    const result = await auth.logInWithGoogle("id-token");

    expect(result.user.id).toBe(ANA_ID);
    expect(verifyToken(result.token)).toBe(ANA_ID);
    const { rows } = await database.query("SELECT google_sub FROM users WHERE id = $1", [ANA_ID]);
    expect(rows).toEqual([{ google_sub: GOOGLE_SUB }]);
  });

  it("signs the person up afresh when the account it found is deleted before the link", async () => {
    await googleVouchesForAna();
    // Ana's deletion has erased her row but not committed when the sign-in,
    // which already found her by email, comes to link Google to it.
    const client = database as unknown as PoolClient;
    await database.query("BEGIN");
    expect(await deletion.lockAccountForDeletion(ANA_ID, client)).toBeDefined();
    await deletion.insertAnonymousLedgerMember({ id: "race-anonymous", name: "Deleted member", color: "#999999" }, client);
    await deletion.eraseAccountData(
      {
        userId: ANA_ID,
        anonymousId: "race-anonymous",
        oldName: "Ana",
        anonymousName: "Deleted member",
        expenseDescription: "Expense",
        itemName: "Item",
        groupName: "Group",
      },
      client,
    );
    const signingIn = auth.logInWithGoogle("id-token").then(
      (result) => ({ outcome: "signed in" as const, result }),
      (error: unknown) => ({ outcome: "failed" as const, error }),
    );
    await waitForRowWaiter();
    await database.query("COMMIT");

    const signIn = await signingIn;

    expect(signIn.outcome).toBe("signed in");
    if (signIn.outcome !== "signed in") return;
    const { rows } = await database.query<{ id: string; google_sub: string }>(
      "SELECT id, google_sub FROM users WHERE email = $1 AND deleted_at IS NULL",
      [ANA_EMAIL],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(ANA_ID);
    expect(rows[0].google_sub).toBe(GOOGLE_SUB);
    expect(signIn.result.user.id).toBe(rows[0].id);
    expect(verifyToken(signIn.result.token)).toBe(rows[0].id);
  });
});

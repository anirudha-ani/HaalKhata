/**
 * Real PostgreSQL test of sign-ins as a person sees them: each browser and
 * phone is a session of its own, and any can be signed out without touching
 * the rest. What it pins down is that signing out really ends a session on
 * the very next request, reaches nobody else's, stops that phone's pushes, and
 * that a token from before sessions had rows can neither duplicate a device
 * nor come back from being signed out.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { randomUUID } from "node:crypto";
import type { HandlerContext } from "@connectrpc/connect";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SESSION_RENEWAL_HEADER } from "@haalkhata/shared/auth/sessionRenewal";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_sessions_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const LAPTOP = { label: "Chrome on Mac", isApp: false };
const PHONE = { label: "iPhone 15 Pro", isApp: true };

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

describe.skipIf(!reachable)("signed-in devices, against Postgres", () => {
  let database: Client;
  let sessions: typeof import("./sessions.usecase");
  let session: typeof import("./session");
  let context: typeof import("@/server/api/connect/context");
  let auth: typeof import("@/server/auth/usecase/account/auth.usecase");
  let registerDevice: typeof import("@/server/push/usecase/devices/devices.usecase").registerDevice;
  let closePool: () => Promise<void>;

  /**
   * Adds an account with nothing on it.
   *
   * @returns Its id.
   */
  const newPerson = async () => {
    const userId = `user-${randomUUID()}`;
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
       VALUES ($1, $1 || '@example.com', 'Sara', '#c73e2e', now(), 'google-' || $1)`,
      [userId],
    );
    return userId;
  };

  /**
   * Signs somebody in.
   *
   * @param userId - Who.
   * @param device - On what.
   * @returns The token, and the session's id.
   */
  const signIn = async (userId: string, device = LAPTOP) => {
    const token = await sessions.startSession({ id: userId, token_version: 0 }, device);
    return { token, id: session.tokenSessionId(token) };
  };

  /**
   * A request as it reaches a handler.
   *
   * @param token - The session it carries.
   * @param methodName - The RPC.
   * @returns The context.
   */
  const requestWith = (token: string, methodName = "ListExpenses") =>
    ({
      requestHeader: new Headers({ authorization: `Bearer ${token}` }),
      responseHeader: new Headers(),
      method: { name: methodName },
    }) as unknown as HandlerContext;

  /**
   * Whether a token can still be used.
   *
   * @param token - The token.
   * @returns True when the API accepts it.
   */
  const isAccepted = (token: string) =>
    context.requireUser(requestWith(token)).then(() => true, () => false);

  /**
   * A token in the format from before sessions had rows.
   *
   * @param userId - Whose.
   * @returns The token.
   */
  const legacyToken = (userId: string) => {
    const payload = `v2.${userId}.0.${Math.floor(Date.now() / 1000) + 3600}`;
    return `${payload}.${session.signPayload("session", payload)}`;
  };

  /**
   * Who a person's list shows.
   *
   * @param userId - Whose.
   * @param currentId - The session asking.
   * @returns The device names.
   */
  const devicesOf = async (userId: string, currentId = "") =>
    (await sessions.listSessions(userId, currentId)).sessions.map((listed) => listed.device);

  /**
   * Registers a phone for pushes under a session.
   *
   * @param userId - Whose.
   * @param sessionId - The session.
   * @param name - Distinguishes this phone.
   * @returns The stored phone.
   */
  const pushPhone = (userId: string, sessionId: string, name: string) =>
    registerDevice(userId, { id: sessionId, version: 0 }, {
      expoPushToken: `ExponentPushToken[${name.padEnd(22, "x")}]`,
      installationId: `install-${name}-${randomUUID()}`,
      platform: "ios",
      label: "iPhone 15 Pro",
      appVersion: "1.0.0",
    } as never);

  /**
   * Which phones of a person can still be pushed to.
   *
   * @param userId - Whose.
   * @returns Their ids.
   */
  const pushPhones = async (userId: string) =>
    (await database.query(`SELECT id FROM push_devices WHERE user_id = $1`, [userId])).rows.map((phone) => phone.id);

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    process.env.DATABASE_URL = TEST_URL;
    process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";
    const dbModule = await import("@/server/common/db/db");
    await dbModule.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    sessions = await import("./sessions.usecase");
    session = await import("./session");
    context = await import("@/server/api/connect/context");
    auth = await import("@/server/auth/usecase/account/auth.usecase");
    ({ registerDevice } = await import("@/server/push/usecase/devices/devices.usecase"));

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
  }, 60_000);

  afterEach(() => vi.useRealTimers());

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("lists each device, and says which one is asking", async () => {
    const userId = await newPerson();
    const laptop = await signIn(userId, LAPTOP);
    await signIn(userId, PHONE);

    const listed = (await sessions.listSessions(userId, laptop.id)).sessions;

    expect(listed.map((device) => device.device).sort()).toEqual(["Chrome on Mac", "iPhone 15 Pro"]);
    expect(listed.find((device) => device.current)?.device).toBe("Chrome on Mac");
    expect(listed.find((device) => !device.current)?.isApp).toBe(true);
  });

  it("signing out here leaves every other device signed in", async () => {
    const userId = await newPerson();
    const laptop = await signIn(userId, LAPTOP);
    const phone = await signIn(userId, PHONE);

    await sessions.endCurrentSession(userId, laptop.id);

    expect(await isAccepted(laptop.token)).toBe(false);
    expect(await isAccepted(phone.token)).toBe(true);
    expect(await devicesOf(userId)).toEqual(["iPhone 15 Pro"]);
  });

  it("signing out another device takes effect on its very next request", async () => {
    const userId = await newPerson();
    const laptop = await signIn(userId, LAPTOP);
    const phone = await signIn(userId, PHONE);

    await sessions.endSession(userId, phone.id, laptop.id);

    expect(await isAccepted(phone.token)).toBe(false);
    expect(await isAccepted(laptop.token)).toBe(true);
  });

  it("the page guard and the API agree about a signed-out device", async () => {
    const userId = await newPerson();
    const laptop = await signIn(userId, LAPTOP);
    const phone = await signIn(userId, PHONE);
    expect(await auth.sessionUser(phone.token)).not.toBeNull();

    await sessions.endSession(userId, phone.id, laptop.id);

    expect(await auth.sessionUser(phone.token)).toBeNull();
    expect(await auth.sessionUser(laptop.token)).not.toBeNull();
  });

  it("cannot reach anybody else's device", async () => {
    const victim = await newPerson();
    const attacker = await newPerson();
    const victimSession = await signIn(victim);
    const attackerSession = await signIn(attacker);

    await expect(sessions.endSession(attacker, victimSession.id, attackerSession.id)).rejects.toMatchObject({ code: "not_found" });

    expect(await isAccepted(victimSession.token)).toBe(true);
  });

  it("does not list anybody else's devices", async () => {
    const someone = await newPerson();
    const other = await newPerson();
    await signIn(someone, PHONE);

    expect(await devicesOf(other)).toEqual([]);
  });

  it("will not end the device asking: signing out is what clears its cookie", async () => {
    const userId = await newPerson();
    const laptop = await signIn(userId);

    await expect(sessions.endSession(userId, laptop.id, laptop.id)).rejects.toMatchObject({ code: "invalid_argument" });

    expect(await isAccepted(laptop.token)).toBe(true);
  });

  it("says so when a device was already signed out", async () => {
    const userId = await newPerson();
    const laptop = await signIn(userId);
    const phone = await signIn(userId, PHONE);
    await sessions.endSession(userId, phone.id, laptop.id);

    await expect(sessions.endSession(userId, phone.id, laptop.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("signing out everywhere else keeps this device and its requests in flight", async () => {
    const userId = await newPerson();
    const laptop = await signIn(userId, LAPTOP);
    const phone = await signIn(userId, PHONE);
    const tablet = await signIn(userId, { label: "iPad", isApp: true });

    await sessions.endOtherSessions(userId, laptop.id);

    expect(await isAccepted(phone.token)).toBe(false);
    expect(await isAccepted(tablet.token)).toBe(false);
    // The very same token: nothing about this device was reissued.
    expect(await isAccepted(laptop.token)).toBe(true);
    expect(await devicesOf(userId)).toEqual(["Chrome on Mac"]);
  });

  it("stops a signed-out phone's pushes and no other phone's", async () => {
    const userId = await newPerson();
    const laptop = await signIn(userId, LAPTOP);
    const firstPhone = await signIn(userId, PHONE);
    const secondPhone = await signIn(userId, PHONE);
    await pushPhone(userId, firstPhone.id, "first");
    const kept = await pushPhone(userId, secondPhone.id, "second");

    await sessions.endSession(userId, firstPhone.id, laptop.id);

    expect(await pushPhones(userId)).toEqual([kept.id]);
  });

  it("stops every other phone's pushes on signing out everywhere else, and keeps this one's", async () => {
    const userId = await newPerson();
    const thisPhone = await signIn(userId, PHONE);
    const otherPhone = await signIn(userId, PHONE);
    const kept = await pushPhone(userId, thisPhone.id, "this");
    await pushPhone(userId, otherPhone.id, "other");

    await sessions.endOtherSessions(userId, thisPhone.id);

    expect(await pushPhones(userId)).toEqual([kept.id]);
  });

  it("takes a phone registered before sessions had rows when a phone signs out, so it is never left receiving", async () => {
    const userId = await newPerson();
    const phone = await signIn(userId, PHONE);
    await pushPhone(userId, phone.id, "unbound");
    await database.query(`UPDATE push_devices SET session_id = NULL WHERE user_id = $1`, [userId]);

    await sessions.endCurrentSession(userId, phone.id);

    expect(await pushPhones(userId)).toEqual([]);
  });

  it("does not take such a phone when only a browser signs out", async () => {
    const userId = await newPerson();
    const laptop = await signIn(userId, LAPTOP);
    const phone = await signIn(userId, PHONE);
    const unbound = await pushPhone(userId, phone.id, "browser");
    await database.query(`UPDATE push_devices SET session_id = NULL WHERE user_id = $1`, [userId]);

    await sessions.endCurrentSession(userId, laptop.id);

    expect(await pushPhones(userId)).toEqual([unbound.id]);
  });

  describe("somebody signed in before sessions had rows", () => {
    it("stays signed in, and moves to a current token on first use", async () => {
      const userId = await newPerson();
      const request = requestWith(legacyToken(userId));

      await expect(context.requireUser(request)).resolves.toBe(userId);

      const renewed = request.responseHeader.get(SESSION_RENEWAL_HEADER);
      expect(renewed).not.toBeNull();
      expect(session.isLegacyToken(renewed!)).toBe(false);
      expect(await isAccepted(renewed!)).toBe(true);
    });

    it("appears once, however many requests a page load sends at the same moment", async () => {
      const userId = await newPerson();
      const token = legacyToken(userId);

      await Promise.all(Array.from({ length: 8 }, () => context.requireUser(requestWith(token))));

      expect(await devicesOf(userId)).toHaveLength(1);
    });

    it("cannot come back once signed out, by replaying the old token or the new one", async () => {
      const userId = await newPerson();
      const token = legacyToken(userId);
      const first = requestWith(token);
      await context.requireUser(first);
      const renewed = first.responseHeader.get(SESSION_RENEWAL_HEADER)!;

      await sessions.endCurrentSession(userId, session.tokenSessionId(renewed));

      expect(await isAccepted(token)).toBe(false);
      expect(await isAccepted(renewed)).toBe(false);
      expect(await devicesOf(userId)).toEqual([]);
    });

    it("is stopped by signing out everywhere else, even if it has never been used since", async () => {
      const userId = await newPerson();
      const unused = legacyToken(userId);
      const laptop = await signIn(userId);

      await sessions.endOtherSessions(userId, laptop.id);

      expect(await isAccepted(unused)).toBe(false);
      expect(await isAccepted(laptop.token)).toBe(true);
    });
  });

  it("notes a device's use at most once a day, and extends it when it does", async () => {
    const userId = await newPerson();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const aged = await signIn(userId);
    vi.useRealTimers();
    await database.query(`UPDATE user_sessions SET last_used_at = now() - interval '3 days' WHERE id = $1`, [aged.id]);
    const lastUsed = async () =>
      new Date((await database.query(`SELECT last_used_at FROM user_sessions WHERE id = $1`, [aged.id])).rows[0].last_used_at).getTime();
    const before = await lastUsed();

    const request = requestWith(aged.token);
    await context.requireUser(request);
    const after = await lastUsed();
    expect(after).toBeGreaterThan(before);

    const renewed = request.responseHeader.get(SESSION_RENEWAL_HEADER)!;
    await context.requireUser(requestWith(renewed));
    expect(await lastUsed()).toBe(after);
  });

  it("keeps the renewed token on the same device", async () => {
    const userId = await newPerson();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const aged = await signIn(userId);
    vi.useRealTimers();

    const request = requestWith(aged.token);
    await context.requireUser(request);

    expect(session.tokenSessionId(request.responseHeader.get(SESSION_RENEWAL_HEADER)!)).toBe(aged.id);
    expect(await devicesOf(userId)).toHaveLength(1);
  });

  it("drops sessions that ran out by themselves the next time somebody signs in", async () => {
    const userId = await newPerson();
    const expired = await signIn(userId, PHONE);
    await database.query(`UPDATE user_sessions SET expires_at = now() - interval '1 day' WHERE id = $1`, [expired.id]);
    expect(await devicesOf(userId)).toEqual([]);

    await signIn(userId, LAPTOP);

    expect((await database.query(`SELECT id FROM user_sessions WHERE user_id = $1`, [userId])).rowCount).toBe(1);
  });

  it("does not list sessions a suspension ended", async () => {
    const userId = await newPerson();
    await signIn(userId);

    await database.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [userId]);

    expect(await devicesOf(userId)).toEqual([]);
  });

  it("keeps nothing but a name for the device", async () => {
    const userId = await newPerson();
    await signIn(userId, LAPTOP);

    const { rows } = await database.query(`SELECT * FROM user_sessions WHERE user_id = $1`, [userId]);

    expect(Object.keys(rows[0]).sort()).toEqual([
      "created_at", "device", "ended_at", "expires_at", "id", "is_app", "last_used_at", "token_version", "user_id",
    ]);
  });
});

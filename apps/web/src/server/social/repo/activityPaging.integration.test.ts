/**
 * Real PostgreSQL regression for audit A12: paging the activity feed must
 * not skip events that share a timestamp, or fall inside the same
 * millisecond as the last event on a page. Postgres keeps microseconds; a
 * cursor rounded to milliseconds used to start the next page after them.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_activity_paging_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const VIEWER = "paging-viewer";

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

/** Feed events newest first, as the feed orders them: by time, then by id. */
const EVENTS = [
  // Three lines written in one transaction share a timestamp to the microsecond.
  ...[0, 1, 2].map(() => ({ id: randomUUID(), createdAt: "2026-10-20T12:00:00.123456Z" })),
  // A fourth inside the same millisecond, a few microseconds earlier.
  { id: randomUUID(), createdAt: "2026-10-20T12:00:00.123100Z" },
  { id: randomUUID(), createdAt: "2026-10-20T11:59:59.000000Z" },
].sort((first, second) =>
  first.createdAt === second.createdAt
    ? second.id.localeCompare(first.id)
    : second.createdAt.localeCompare(first.createdAt),
);

const reachable = await databaseReachable();

describe.skipIf(!reachable)("activity feed paging against Postgres", () => {
  let database: Client;
  let listActivityPage: typeof import("./activity.repo").listActivityPage;
  let closePool: () => Promise<void>;

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
    ({ listActivityPage } = await import("./activity.repo"));
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, google_sub)
       VALUES ($1, 'paging-viewer@example.com', 'Viewer', '#336699', 'google-paging-viewer')`,
      [VIEWER],
    );
    for (const event of EVENTS) {
      await database.query(
        `INSERT INTO activity (id, actor_id, type, message, audience, created_at)
         VALUES ($1, $2, 'other', 'Something happened', jsonb_build_array($2::text), $3)`,
        [event.id, VIEWER, event.createdAt],
      );
    }
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  /**
   * Reads the whole feed a page at a time, following each next cursor.
   * @param pageSize - Events per page.
   * @returns Every event id returned, in order.
   */
  async function pageThrough(pageSize: number): Promise<string[]> {
    const seen: string[] = [];
    let cursor = "";
    for (let pageCount = 0; pageCount < EVENTS.length + 1; pageCount += 1) {
      const page = await listActivityPage({ userId: VIEWER }, { limit: pageSize, cursor, month: "" });
      seen.push(...page.rows.map((activityRow) => activityRow.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return seen;
  }

  it("returns every event, once, when a page break falls among events sharing a timestamp", async () => {
    expect(await pageThrough(1)).toEqual(EVENTS.map((event) => event.id));
  });

  it("returns every event with any page size", async () => {
    expect(await pageThrough(2)).toEqual(EVENTS.map((event) => event.id));
    expect(await pageThrough(3)).toEqual(EVENTS.map((event) => event.id));
  });
});

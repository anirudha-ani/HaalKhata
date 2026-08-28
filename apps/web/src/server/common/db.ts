/** Shared Postgres access: lazy pool, one-shot startup migration, query/transaction helpers. */

import { Pool, types, type PoolClient } from "pg";
import type { QueryResultRow } from "pg";
import path from "node:path";
import { runner } from "node-pg-migrate";
import { DEFAULT_DATABASE_URL } from "@/server/common/db.constants";
import { logError } from "@/server/common/logger";

// Keep date/time columns as strings end-to-end (row types say `string`);
// pg would otherwise hand back JS Date objects.
//
// Timestamps are normalized to ISO 8601 UTC ("…T…Z") right here at the
// boundary: Postgres's own text form ("2026-08-09 00:38:12.123456+00")
// reaches browsers otherwise, where Date parsing of that shape is
// engine-dependent — and a timestamp a client cannot parse cannot be shown
// in the viewer's local time. Storage stays UTC; only the spelling changes.
// Calendar dates (DATE, and TEXT columns like expense_date) stay as the
// plain "YYYY-MM-DD" the user chose — they name a day, not a moment, and
// converting them would shift them.
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());
types.setTypeParser(types.builtins.TIMESTAMP, (value) => value);
types.setTypeParser(types.builtins.DATE, (value) => value);

/** Resolves the Postgres connection string, preferring the DATABASE_URL env var. */
function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

/**
 * In production, refuse the insecure default connection string
 * (haalkhata:haalkhata) so a forgotten POSTGRES_PASSWORD doesn't silently
 * deploy with a guessable credential. Dev keeps the default for zero-config
 * `pnpm dev`.
 */
function assertSafeDatabaseUrl(): void {
  if (process.env.NODE_ENV === "production" && databaseUrl() === DEFAULT_DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set to a non-default value in production (got the haalkhata:haalkhata default).",
    );
  }
}

// Survive Next.js dev-server hot reloads without leaking connections.
const globalCache = globalThis as unknown as {
  __haalkhataPool?: Pool;
  __haalkhataReady?: Promise<void>;
};

/** Returns the process-wide connection pool, creating it on first use. */
function pool(): Pool {
  if (!globalCache.__haalkhataPool) {
    assertSafeDatabaseUrl();
    const createdPool = new Pool({
      connectionString: databaseUrl(),
      // Bound pool so multi-replica deploys don't exhaust Postgres connections.
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    // pg emits idle-client failures on the Pool. EventEmitter treats an
    // unhandled "error" event as an uncaught exception, so this listener is
    // required to survive routine database restarts and network failures.
    createdPool.on("error", (error, client) => {
      logError(error, { scope: "pg-pool-idle-client", clientPresent: Boolean(client) });
    });
    globalCache.__haalkhataPool = createdPool;
  }
  return globalCache.__haalkhataPool;
}

/**
 * Applies pending SQL migrations from ./migrations once per process
 * (node-pg-migrate, history in "pgmigrations"). The result is cached on the
 * global so subsequent calls are no-ops; a failure clears the cache so the
 * next call retries instead of permanently bricking the app.
 */
export function ensureMigrated(): Promise<void> {
  if (!globalCache.__haalkhataReady) {
    assertSafeDatabaseUrl();
    globalCache.__haalkhataReady = runner({
      databaseUrl: databaseUrl(),
      dir: path.join(process.cwd(), "migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
    })
      .then(() => undefined)
      .catch((error) => {
        globalCache.__haalkhataReady = undefined;
        throw error;
      });
  }
  return globalCache.__haalkhataReady;
}

/**
 * Runs a parameterized SQL statement and returns every resulting row.
 *
 * @param text - SQL statement with $1-style placeholders.
 * @param params - Values bound to the statement's placeholders, in order.
 * @param client - Existing transaction client; omitted to use the shared pool.
 * @returns All rows produced by the statement.
 */
export async function query<ResultRow extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: PoolClient,
): Promise<ResultRow[]> {
  const executor = client ?? pool();
  const { rows } = await executor.query<ResultRow>(text, params as never[]);
  return rows;
}

/**
 * Runs a parameterized SQL statement and returns only its first row.
 *
 * @param text - SQL statement with $1-style placeholders.
 * @param params - Values bound to the statement's placeholders, in order.
 * @param client - Existing transaction client; omitted to use the shared pool.
 * @returns The first resulting row, or undefined when nothing matches.
 */
export async function queryOne<ResultRow extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: PoolClient,
): Promise<ResultRow | undefined> {
  return (await query<ResultRow>(text, params, client))[0];
}

/**
 * Runs a parameterized SQL statement for its side effects, discarding any rows.
 *
 * @param text - SQL statement with $1-style placeholders.
 * @param params - Values bound to the statement's placeholders, in order.
 * @param client - Existing transaction client; omitted to use the shared pool.
 */
export async function execute(
  text: string,
  params: unknown[] = [],
  client?: PoolClient,
): Promise<void> {
  await query(text, params, client);
}

/**
 * Runs operation inside BEGIN/COMMIT, rolling back if it throws; the supplied
 * client must be used for every statement inside the transaction.
 *
 * @param operation - Callback that performs all transactional statements on the supplied client.
 * @returns Whatever operation resolves to, once the transaction has committed.
 */
export async function transaction<TransactionResult>(
  operation: (client: PoolClient) => Promise<TransactionResult>,
): Promise<TransactionResult> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Generates a random UUID for use as a new row's primary key. */
export function newId(): string {
  return crypto.randomUUID();
}

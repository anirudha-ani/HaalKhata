/** Shared Postgres access: lazy pool, startup migrations, query/transaction helpers. */

import { Pool, types, type PoolClient } from "pg";
import type { QueryResultRow } from "pg";
import path from "node:path";
import { runner } from "node-pg-migrate";
import { DEFAULT_DATABASE_URL } from "@/server/common/db.constants";

// Keep date/time columns as strings end-to-end (row types say `string`);
// pg would otherwise hand back JS Date objects.
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value) => value);
types.setTypeParser(types.builtins.TIMESTAMP, (value) => value);
types.setTypeParser(types.builtins.DATE, (value) => value);

/** Resolves the Postgres connection string, preferring the DATABASE_URL env var. */
function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

// Survive Next.js dev-server hot reloads without leaking connections.
const globalCache = globalThis as unknown as {
  __haalkhataPool?: Pool;
  __haalkhataReady?: Promise<void>;
};

/** Returns the process-wide connection pool, creating it on first use. */
function pool(): Pool {
  if (!globalCache.__haalkhataPool) {
    globalCache.__haalkhataPool = new Pool({ connectionString: databaseUrl() });
  }
  return globalCache.__haalkhataPool;
}

/**
 * Applies pending SQL migrations from ./migrations once per process
 * (node-pg-migrate, history in "pgmigrations"); retried on failure.
 */
function ready(): Promise<void> {
  if (!globalCache.__haalkhataReady) {
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
 * @returns All rows produced by the statement.
 */
export async function query<ResultRow extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<ResultRow[]> {
  await ready();
  const { rows } = await pool().query<ResultRow>(text, params as never[]);
  return rows;
}

/**
 * Runs a parameterized SQL statement and returns only its first row.
 *
 * @param text - SQL statement with $1-style placeholders.
 * @param params - Values bound to the statement's placeholders, in order.
 * @returns The first resulting row, or undefined when nothing matches.
 */
export async function queryOne<ResultRow extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<ResultRow | undefined> {
  return (await query<ResultRow>(text, params))[0];
}

/**
 * Runs a parameterized SQL statement for its side effects, discarding any rows.
 *
 * @param text - SQL statement with $1-style placeholders.
 * @param params - Values bound to the statement's placeholders, in order.
 */
export async function execute(text: string, params: unknown[] = []): Promise<void> {
  await query(text, params);
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
  await ready();
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

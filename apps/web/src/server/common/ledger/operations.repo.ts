/** All SQL for the operations table (idempotency keys for retried financial mutations). */

import type { PoolClient } from "pg";
import { execute, query, queryOne } from "@/server/common/db/db";
import { OPERATION_RETENTION_HOURS } from "./operations.constants";

/** The stored half of a claim: what the first request looked like and produced. */
export interface OperationRow {
  request_fingerprint: string;
  /** Id of the row the operation produced; null only while the claim is uncommitted. */
  result_id: string | null;
}

/** Identifies one operation: the caller, the RPC, and the client's id for it. */
export interface OperationKey {
  userId: string;
  rpc: string;
  operationId: string;
}

/**
 * Claims an operation id for the caller inside the given transaction.
 *
 * A concurrent request for the same operation blocks on the first claim
 * until this transaction commits or rolls back — Postgres holds a conflicting
 * insert until the first one's fate is known — so a duplicate never runs
 * alongside the original; it either finds the committed row or finds
 * nothing and claims for itself.
 *
 * A row for the same id older than retention is taken over in place, so a
 * reused id runs again after {@link OPERATION_RETENTION_HOURS} whether or not
 * the sweep has removed it. The statement touches no row but this id's own:
 * clearing out other expired claims is the sweep's job, outside every money
 * transaction ({@link pruneExpiredOperations}), so a claim never waits on, or
 * holds up, an unrelated write.
 *
 * @param operation - The operation being claimed.
 * @param requestFingerprint - Digest of the request payload, minus the id.
 * @param client - The transaction the business row is written in.
 * @returns True when this transaction now owns the claim; false when a
 *   committed row within retention already holds it.
 */
export async function claimOperation(
  operation: OperationKey,
  requestFingerprint: string,
  client: PoolClient,
): Promise<boolean> {
  const claimed = await queryOne<{ operation_id: string }>(
    `INSERT INTO operations (user_id, rpc, operation_id, request_fingerprint)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, rpc, operation_id) DO UPDATE
        SET request_fingerprint = EXCLUDED.request_fingerprint, result_id = NULL, created_at = now()
      WHERE operations.created_at < now() - ($5 || ' hours')::interval
     RETURNING operation_id`,
    [operation.userId, operation.rpc, operation.operationId, requestFingerprint, String(OPERATION_RETENTION_HOURS)],
    client,
  );
  return claimed !== undefined;
}

/**
 * Reads the committed claim for an operation, for replaying its result. A
 * claim past retention counts as absent, as it does when claiming.
 *
 * @param operation - The operation to look up.
 * @param client - Transaction client.
 * @returns The stored fingerprint and result id, or undefined when unclaimed.
 */
export async function findOperation(
  operation: OperationKey,
  client: PoolClient,
): Promise<OperationRow | undefined> {
  return queryOne<OperationRow>(
    `SELECT request_fingerprint, result_id FROM operations
      WHERE user_id = $1 AND rpc = $2 AND operation_id = $3
        AND created_at >= now() - ($4 || ' hours')::interval`,
    [operation.userId, operation.rpc, operation.operationId, String(OPERATION_RETENTION_HOURS)],
    client,
  );
}

/**
 * Records what a claimed operation produced, on the same transaction, so the
 * claim and its result commit together.
 *
 * @param operation - The claimed operation.
 * @param resultId - Id of the row it created.
 * @param client - The transaction the business row was written in.
 */
export async function completeOperation(
  operation: OperationKey,
  resultId: string,
  client: PoolClient,
): Promise<void> {
  await execute(
    `UPDATE operations SET result_id = $4
      WHERE user_id = $1 AND rpc = $2 AND operation_id = $3`,
    [operation.userId, operation.rpc, operation.operationId, resultId],
    client,
  );
}

/**
 * Removes up to `batchSize` claims past retention, oldest first, in one
 * autocommit statement on the pool — never inside a money transaction.
 * Rows another transaction has locked are skipped rather than waited for,
 * so two sweeps, or a sweep and a write, never queue behind each other.
 *
 * @param batchSize - Most rows to remove in this statement.
 * @returns How many rows were removed.
 */
export async function pruneExpiredOperations(batchSize: number): Promise<number> {
  const removed = await query<{ operation_id: string }>(
    `DELETE FROM operations
      WHERE (user_id, rpc, operation_id) IN (
        SELECT user_id, rpc, operation_id FROM operations
         WHERE created_at < now() - ($1 || ' hours')::interval
         ORDER BY created_at
         LIMIT $2
           FOR UPDATE SKIP LOCKED)
     RETURNING operation_id`,
    [String(OPERATION_RETENTION_HOURS), batchSize],
  );
  return removed.length;
}

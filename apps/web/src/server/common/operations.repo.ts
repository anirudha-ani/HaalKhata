/** All SQL for the operations table (idempotency keys for retried financial mutations). */

import type { PoolClient } from "pg";
import { execute, queryOne } from "@/server/common/db";
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
 * A concurrent request with the same operation blocks on the primary operation until
 * this transaction commits or rolls back — Postgres holds a conflicting
 * insert until the first one's fate is known — so a duplicate never runs
 * alongside the original; it either finds the committed row or finds
 * nothing and claims for itself.
 *
 * Also prunes claims past retention, so the table never grows without
 * bound; the index on created_at keeps that cheap.
 *
 * @param operation - The operation being claimed.
 * @param requestFingerprint - Digest of the request payload, minus the id.
 * @param client - The transaction the business row is written in.
 * @returns True when this transaction now owns the claim; false when a
 *   committed row already holds it.
 */
export async function claimOperation(
  operation: OperationKey,
  requestFingerprint: string,
  client: PoolClient,
): Promise<boolean> {
  await execute(
    `DELETE FROM operations WHERE created_at < now() - ($1 || ' hours')::interval`,
    [String(OPERATION_RETENTION_HOURS)],
    client,
  );
  const claimed = await queryOne<{ operation_id: string }>(
    `INSERT INTO operations (user_id, rpc, operation_id, request_fingerprint)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING operation_id`,
    [operation.userId, operation.rpc, operation.operationId, requestFingerprint],
    client,
  );
  return claimed !== undefined;
}

/**
 * Reads the committed claim for a operation, for replaying its result.
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
      WHERE user_id = $1 AND rpc = $2 AND operation_id = $3`,
    [operation.userId, operation.rpc, operation.operationId],
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

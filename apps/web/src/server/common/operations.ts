/** Idempotent financial mutations: client-named operations, claimed and replayed on retry. */

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { invalid, UsecaseError } from "./errors";
import { MAX_OPERATION_ID_LENGTH, OPERATION_ID_PATTERN } from "./operations.constants";
import {
  claimOperation,
  completeOperation,
  findOperation,
  type OperationKey,
} from "./operations.repo";

/**
 * Validates a client-supplied operation id at the transport boundary.
 *
 * Required on every externally initiated financial mutation: without it a
 * retry of a lost response is indistinguishable from a second, deliberate
 * action, and the server would store both.
 *
 * @param operationId - The id from the request.
 * @returns The id, unchanged.
 * @throws UsecaseError (invalid_argument) when it is missing or malformed.
 */
export function assertOperationId(operationId: string): string {
  if (operationId === "") invalid("operation_id is required");
  if (operationId.length > MAX_OPERATION_ID_LENGTH) {
    invalid(`operation_id is too long (max ${MAX_OPERATION_ID_LENGTH} characters)`);
  }
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    invalid("operation_id may only contain letters, digits, '-' and '_'");
  }
  return operationId;
}

/**
 * Serializes a value with object keys sorted at every level, so two requests
 * that mean the same thing hash the same regardless of operation order.
 *
 * @param value - Any JSON-representable value.
 * @returns Canonical JSON text.
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([entryKey, entryValue]) => `${JSON.stringify(entryKey)}:${canonicalJson(entryValue)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Digests a request so a reused operation id can be checked against the
 * payload it was first used with. The id itself is left out — it is the operation,
 * not the content.
 *
 * @param request - The request as the usecase received it.
 * @returns A hex SHA-256 of the canonical payload.
 */
export function requestFingerprint(request: object): string {
  const { operationId: _ignored, $typeName: _typeName, ...payload } = request as Record<
    string,
    unknown
  >;
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

/** What a claim came back with: run the operation, or replay a finished one. */
export type OperationClaim = { replayOf: null } | { replayOf: string };

/**
 * Claims an operation inside the caller's transaction, or resolves it to the
 * result a completed claim produced.
 *
 * Semantics follow the idempotency-operation draft and Stripe's practice: the same
 * id with the same payload replays the first result; the same id with a
 * different payload is refused; a duplicate arriving while the first is
 * still in flight waits for it (the primary operation blocks) and then replays.
 * An empty id skips deduplication — the transport boundary requires one on
 * every external request, so that path is only for internal callers.
 *
 * @param operation - The caller, the RPC, and the client's operation id.
 * @param request - The request payload, for the fingerprint.
 * @param client - The transaction the business row will be written in.
 * @returns `replayOf` naming the earlier result's id, or null to proceed.
 */
export async function beginOperation(
  operation: OperationKey,
  request: object,
  client: PoolClient,
): Promise<OperationClaim> {
  if (operation.operationId === "") return { replayOf: null };
  const fingerprint = requestFingerprint(request);
  if (await claimOperation(operation, fingerprint, client)) return { replayOf: null };
  const existing = await findOperation(operation, client);
  if (!existing) {
    // Claimed and rolled back between our insert and our read — vanishingly
    // rare; the retry that follows will claim it cleanly.
    throw new UsecaseError("unavailable", "that request is still being processed — try again");
  }
  if (existing.request_fingerprint !== fingerprint) {
    invalid("operation_id was already used for a different request");
  }
  if (existing.result_id === null) {
    throw new UsecaseError("unavailable", "that request is still being processed — try again");
  }
  return { replayOf: existing.result_id };
}

/**
 * Marks a claimed operation complete with the id of what it produced. A
 * no-op for an empty id, matching {@link beginOperation}.
 *
 * @param operation - The claimed operation.
 * @param resultId - Id of the row the operation created.
 * @param client - The same transaction the claim was made in.
 */
export async function finishOperation(
  operation: OperationKey,
  resultId: string,
  client: PoolClient,
): Promise<void> {
  if (operation.operationId === "") return;
  await completeOperation(operation, resultId, client);
}

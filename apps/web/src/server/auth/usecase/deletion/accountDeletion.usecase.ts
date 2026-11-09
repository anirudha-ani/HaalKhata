/** Account deletion: explicit confirmation, Apple revocation and transactional data erasure. */

import { lockAccountContentForErasure } from "@/server/common/ledger/accountContentLocks";
import type { PoolClient } from "pg";
import { LEDGER_BUSY_ERROR_CODES, LEDGER_BUSY_MESSAGE } from "@/server/common/ledger/ledgerLocks.constants";
import { newId, transaction } from "@/server/common/db/db";
import { invalid, UsecaseError } from "@/server/common/errors";
import { ACCOUNT_ERASURE_ATTEMPTS, ANONYMOUS_MEMBER_COLOR, ANONYMOUS_MEMBER_NAME, DELETE_ACCOUNT_CONFIRMATION,
  DELETED_EXPENSE_DESCRIPTION, DELETED_GROUP_NAME, DELETED_ITEM_NAME } from "../../accountDeletion.constants";
import { deletionReportsUnchanged, lockDeletionReports, eraseAccountData, insertAnonymousLedgerMember, listDeletionGroupMembers,
  lockAccountForDeletion, transferDeletionGroupOwnership, flushDeletionConstraints } from "../../repo/deletion/accountDeletion.repo";
import { listAppleCredentials } from "../../repo/apple/appleSignIn.repo";
import { revokeAppleToken } from "../apple/apple.provider";

/** Signals a report committed before the account row could fence off new reports. */
class AccountReportsChanged extends Error {}

/**
 * Permanently erases an account without cancelling another member's shared cents.
 * @param userId Authenticated account; never accepted as a target from request fields.
 * @param confirmation Exact destructive-action confirmation.
 * @returns Resolves only after provider revocation and full database commit.
 */
export async function deleteAccount(userId: string, confirmation: string): Promise<void> {
  if (confirmation !== DELETE_ACCOUNT_CONFIRMATION) invalid("confirm permanent account deletion");
  /** Locks every report that can cascade before changing the account or its content. */
  const attempt = () => transaction(async (client) => {
    const credentials = await prepareDeletionBeforeProviders(userId, client);
    for (const credential of credentials) await revokeAppleToken(credential.client_id, credential.refresh_token_ciphertext);
    // The transaction commits next. No further SQL, including deferred checks,
    // may introduce a new lock failure after the irreversible provider calls.
  });
  for (let attemptNumber = 0; attemptNumber < ACCOUNT_ERASURE_ATTEMPTS; attemptNumber++) {
    try {
      await attempt();
      return;
    } catch (error) {
      if (!(error instanceof AccountReportsChanged)) throw error;
    }
  }
  throw new UsecaseError("unavailable", "Your account changed during deletion. Nothing was deleted. Please try again.");
}

/**
 * Prepares reversible database erasure before external credential revocation.
 * Parent/revision lock failures and deferred integrity errors happen here;
 * a later provider failure still rolls back all pending database changes.
 * @param userId Account being erased.
 * @param client Erasure transaction.
 * @returns Captured credentials, independent of their pending local deletion.
 */
async function prepareDeletionBeforeProviders(userId: string, client: PoolClient) {
  try {
    const reports = await lockDeletionReports(userId, client);
    await lockAccountContentForErasure(client, userId);
    const account = await lockAccountForDeletion(userId, client);
    if (!account) throw new UsecaseError("unauthenticated", "account no longer exists");
    if (!await deletionReportsUnchanged(userId, reports, client)) throw new AccountReportsChanged();
    const credentials = await listAppleCredentials(userId, client);
    const anonymousId = newId();
    await insertAnonymousLedgerMember({ id: anonymousId, name: ANONYMOUS_MEMBER_NAME, color: ANONYMOUS_MEMBER_COLOR }, client);
    const candidates = await listDeletionGroupMembers(userId, client);
    const transferred = new Set<string>();
    for (const candidate of candidates) {
      if (transferred.has(candidate.group_id)) continue;
      await transferDeletionGroupOwnership(candidate.group_id, candidate.id, DELETED_GROUP_NAME, client);
      transferred.add(candidate.group_id);
    }
    await eraseAccountData({ userId, anonymousId,
      expenseDescription: DELETED_EXPENSE_DESCRIPTION, itemName: DELETED_ITEM_NAME, groupName: DELETED_GROUP_NAME }, client);
    await flushDeletionConstraints(client);
    return credentials;
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === "string" && LEDGER_BUSY_ERROR_CODES.has(code)) {
      throw new UsecaseError("unavailable", LEDGER_BUSY_MESSAGE);
    }
    throw error;
  }
}

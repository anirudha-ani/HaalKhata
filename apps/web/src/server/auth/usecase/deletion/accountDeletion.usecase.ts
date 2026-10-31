/** Account deletion: explicit confirmation, Apple revocation and transactional data erasure. */

import { newId, transaction } from "@/server/common/db/db";
import { invalid, UsecaseError } from "@/server/common/errors";
import { ANONYMOUS_MEMBER_COLOR, ANONYMOUS_MEMBER_NAME, DELETE_ACCOUNT_CONFIRMATION,
  DELETED_EXPENSE_DESCRIPTION, DELETED_GROUP_NAME, DELETED_ITEM_NAME } from "../../accountDeletion.constants";
import { eraseAccountData, insertAnonymousLedgerMember, listDeletionGroupMembers,
  lockAccountForDeletion, transferDeletionGroupOwnership } from "../../repo/deletion/accountDeletion.repo";
import { listAppleCredentials } from "../../repo/apple/appleSignIn.repo";
import { revokeAppleToken } from "../apple/apple.provider";

/**
 * Permanently erases an account without cancelling another member's shared cents.
 * @param userId Authenticated account; never accepted as a target from request fields.
 * @param confirmation Exact destructive-action confirmation.
 * @returns Resolves only after provider revocation and full database commit.
 */
export async function deleteAccount(userId: string, confirmation: string): Promise<void> {
  if (confirmation !== DELETE_ACCOUNT_CONFIRMATION) invalid("confirm permanent account deletion");
  await transaction(async (client) => {
    const account = await lockAccountForDeletion(userId, client);
    if (!account) throw new UsecaseError("unauthenticated", "account no longer exists");
    const credentials = await listAppleCredentials(userId, client);
    for (const credential of credentials) await revokeAppleToken(credential.client_id, credential.refresh_token_ciphertext);
    const anonymousId = newId();
    await insertAnonymousLedgerMember({ id: anonymousId, name: ANONYMOUS_MEMBER_NAME, color: ANONYMOUS_MEMBER_COLOR }, client);
    const candidates = await listDeletionGroupMembers(userId, client);
    const transferred = new Set<string>();
    for (const candidate of candidates) {
      if (transferred.has(candidate.group_id)) continue;
      await transferDeletionGroupOwnership(candidate.group_id, candidate.id, DELETED_GROUP_NAME, client);
      transferred.add(candidate.group_id);
    }
    await eraseAccountData({ userId, anonymousId, oldName: account.name, anonymousName: ANONYMOUS_MEMBER_NAME,
      expenseDescription: DELETED_EXPENSE_DESCRIPTION, itemName: DELETED_ITEM_NAME, groupName: DELETED_GROUP_NAME }, client);
  });
}

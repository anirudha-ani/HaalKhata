/** Resolves invitation credentials again inside the transaction that admits their holder. */

import type { PoolClient } from "pg";
import { notFound, UsecaseError } from "@/server/common/errors";
import { findLinkByToken, type InviteLinkRow } from "@/server/social/repo/inviteLinks.repo";
import { DEAD_LINK_MESSAGE, EXPIRED_LINK_MESSAGE, INVITE_LINK_TOKEN_PATTERN } from "@/server/social/social.constants";
import { LIVE_SPLIT_ENDED_MESSAGE } from "@haalkhata/shared/expense/live/live.constants";

/**
 * Resolves a presented token to its live link, with one generic refusal for
 * every dead shape and its own for a group link past its date, including
 * one already replaced by a new link. Saying it expired tells the holder
 * nothing they did not have: the token is theirs, and no group, inviter or
 * member count is given with it. A link its owner turned off before its date
 * gets the generic refusal, like a token nobody made.
 *
 * @param token - The token from the shared URL.
 * @param client - The admission transaction holding the applicable resource lock.
 * @returns The active link row.
 * @throws UsecaseError (not_found) for a missing, malformed or turned-off
 *   token; (failed_precondition) for one that has expired.
 */
export async function loadActiveLink(token: string, client?: PoolClient): Promise<InviteLinkRow> {
  if (!INVITE_LINK_TOKEN_PATTERN.test(token)) notFound(DEAD_LINK_MESSAGE);
  const link = await findLinkByToken(token, client);
  if (!link) notFound(DEAD_LINK_MESSAGE);
  if (link.kind === "live" && (link.expired || link.revoked)) {
    throw new UsecaseError("failed_precondition", LIVE_SPLIT_ENDED_MESSAGE);
  }
  if (link.expired) throw new UsecaseError("failed_precondition", EXPIRED_LINK_MESSAGE);
  if (link.revoked) notFound(DEAD_LINK_MESSAGE);
  return link;
}

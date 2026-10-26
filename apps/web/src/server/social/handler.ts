/** Thin SocialService Connect handlers; logic lives in social.usecase. */

import type { ServiceImpl } from "@connectrpc/connect";
import type { SocialService } from "@haalkhata/protogen/social/v1/social_pb";
import { Code, ConnectError } from "@connectrpc/connect";
import * as social from "@/server/social/usecase/social.usecase";
import { findContacts } from "@/server/social/usecase/contacts/findContacts.usecase";
import { sendFriendRequests } from "@/server/social/usecase/contacts/sendFriendRequests.usecase";
import { requireUser, runUsecase } from "@/server/api/connect/context";
import { requireRateLimitedUser, RPC_RATE_LIMITS } from "@/server/api/connect/rpcRateLimit";
import { clientIp } from "@/server/auth/request/clientIp";
import { rateLimitCheck } from "@/server/common/rateLimit/rateLimit";
import { INVITE_PREVIEW_RATE_LIMIT, RETIRED_PERSON_INVITE_MESSAGE } from "@/server/social/social.constants";

/**
 * ConnectRPC implementation of SocialService. Each method authenticates the
 * caller via {@link requireUser} and delegates to the social usecase inside
 * {@link runUsecase}, which maps UsecaseError to ConnectError.
 */
export const socialHandler: ServiceImpl<typeof SocialService> = {
  /** Sends a privacy-preserving friend request. */
  async addFriend(request, context) {
    return runUsecase(
      async () =>
        social.addFriend(
          await requireRateLimitedUser(context, "add-friend", RPC_RATE_LIMITS.addFriend),
          request,
        ),
      context,
    );
  },

  /** Lists the caller's friends (with net balances). */
  async listFriends(_request, context) {
    // ListFriends computes the same full-ledger aggregate as
    // GetOverallBalances, so both endpoints deliberately consume the same
    // per-account bucket instead of allowing one to bypass the other.
    return runUsecase(
      async () =>
        social.listFriends(
          await requireRateLimitedUser(
            context,
            "get-overall-balances",
            RPC_RATE_LIMITS.getOverallBalances,
          ),
        ),
      context,
    );
  },

  /** Accepts or declines one request addressed to the caller. */
  async respondFriendRequest(request, context) {
    await runUsecase(
      async () =>
        social.respondFriendRequest(
          await requireUser(context),
          request.userId,
          request.accept,
        ),
      context,
    );
    return {};
  },

  /** Withdraws a pending request the caller sent. */
  async cancelFriendRequest(request, context) {
    await runUsecase(
      async () =>
        social.cancelFriendRequest(await requireUser(context), {
          userId: request.userId,
          identifier: request.identifier,
        }),
      context,
    );
    return {};
  },

  /** Lists the activity feed, scoped to one group when groupId is set. */
  async listActivity(request, context) {
    return runUsecase(
      async () =>
        social.listActivity(await requireUser(context), {
          groupId: request.groupId || undefined,
          cursor: request.cursor,
          limit: request.limit,
          month: request.month,
        }),
      context,
    );
  },

  /** Lists the caller's notifications together with the unread count. */
  async listNotifications(_request, context) {
    return runUsecase(async () => social.listNotifications(await requireUser(context)), context);
  },

  /** Marks all of the caller's notifications as read. */
  async markNotificationsRead(_request, context) {
    await runUsecase(async () => social.markNotificationsRead(await requireUser(context)), context);
    return {};
  },

  /** Retired with one-person invite links; always refused. */
  async getFriendInviteLink() {
    throw new ConnectError(RETIRED_PERSON_INVITE_MESSAGE, Code.FailedPrecondition);
  },

  /** The group's one active join link, created on first ask; any member may. */
  async createGroupInviteLink(request, context) {
    return runUsecase(
      async () => social.createGroupInviteLink(await requireUser(context), request.groupId),
      context,
    );
  },

  /** Retired with one-person invite links; always refused. */
  async inviteContactToSignUp() {
    throw new ConnectError(RETIRED_PERSON_INVITE_MESSAGE, Code.FailedPrecondition);
  },

  /** The caller's own "add me" link, minted on first ask. */
  async getProfileInviteLink(_request, context) {
    return runUsecase(
      async () => social.getProfileInviteLink(await requireUser(context)),
      context,
    );
  },

  /** Disables the caller's profile link; the next ask mints a fresh one. */
  async revokeProfileInviteLink(_request, context) {
    await runUsecase(
      async () => social.revokeProfileInviteLink(await requireUser(context)),
      context,
    );
    return {};
  },

  /** Disables the group's join link; owner only. */
  async revokeGroupInviteLink(request, context) {
    await runUsecase(
      async () => social.revokeGroupInviteLink(await requireUser(context), request.groupId),
      context,
    );
    return {};
  },

  /**
   * UNAUTHENTICATED preview of what a link offers, for the landing page a
   * signed-out person sees. The unguessable token is the credential; the
   * per-address limit just keeps the endpoint from being a scanner target.
   */
  async previewInviteLink(request, context) {
    if (!rateLimitCheck(`invite-preview:${clientIp(context.requestHeader)}`, INVITE_PREVIEW_RATE_LIMIT)) {
      throw new ConnectError("too many requests, please try again later", Code.ResourceExhausted);
    }
    return runUsecase(() => social.previewInviteLink(request.token), context);
  },

  /** Accepts a link as the signed-in caller: join and/or claim, then befriend. */
  async acceptInviteLink(request, context) {
    return runUsecase(
      async () =>
        social.acceptInviteLink(
          await requireRateLimitedUser(context, "accept-invite", RPC_RATE_LIMITS.acceptInvite),
          request.token,
        ),
      context,
    );
  },

  /** Ends a friendship; the usecase enforces the settled-balance gate (§37). */
  async removeFriend(request, context) {
    await runUsecase(
      async () =>
        social.removeFriend(
          await requireRateLimitedUser(context, "remove-friend", RPC_RATE_LIMITS.removeFriend),
          request.userId,
        ),
      context,
    );
    return {};
  },

  /**
   * Matches identifiers from the caller's contacts against findable
   * accounts. The request body is never logged: runUsecase reports only the
   * RPC name and a request id for unexpected errors.
   */
  async findContacts(request, context) {
    return runUsecase(
      async () =>
        findContacts(
          await requireRateLimitedUser(context, "find-contacts", RPC_RATE_LIMITS.findContacts),
          { phones: request.phones, emails: request.emails },
        ),
      context,
    );
  },

  /** Sends one friend request to each picked account, as a single call. */
  async sendFriendRequests(request, context) {
    await runUsecase(
      async () =>
        sendFriendRequests(
          await requireRateLimitedUser(
            context,
            "send-friend-requests",
            RPC_RATE_LIMITS.sendFriendRequests,
          ),
          request.userIds,
        ),
      context,
    );
    return {};
  },

  /** Nudges someone who owes the caller money; rate-limited in the usecase. */
  async sendReminder(request, context) {
    await runUsecase(
      async () =>
        social.sendReminder(
          await requireRateLimitedUser(
            context,
            "send-reminder",
            RPC_RATE_LIMITS.sendReminder,
          ),
          request.userId,
        ),
      context,
    );
    return {};
  },
};

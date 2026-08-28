/** Thin SocialService Connect handlers; logic lives in social.usecase. */

import type { ServiceImpl } from "@connectrpc/connect";
import type { SocialService } from "@haalkhata/protogen/social/v1/social_pb";
import * as social from "@/server/social/usecase/social.usecase";
import { requireUser, runUsecase } from "@/server/api/connect/context";
import { requireRateLimitedUser, RPC_RATE_LIMITS } from "@/server/api/connect/rpcRateLimit";

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
    return runUsecase(async () => social.listFriends(await requireUser(context)), context);
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

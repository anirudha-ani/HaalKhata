/** Thin SocialService Connect handlers; logic lives in social.usecase. */

import type { ServiceImpl } from "@connectrpc/connect";
import type { SocialService } from "@haalkhata/protogen/social/v1/social_pb";
import * as social from "@/server/social/usecase/social.usecase";
import { requireUser, runUsecase } from "@/server/api/connect/context";

/**
 * ConnectRPC implementation of SocialService. Each method authenticates the
 * caller via {@link requireUser} and delegates to the social usecase inside
 * {@link runUsecase}, which maps UsecaseError to ConnectError.
 */
export const socialHandler: ServiceImpl<typeof SocialService> = {
  /** Adds a friend by email, creating a shadow user if needed. */
  async addFriend(request, context) {
    return runUsecase(async () => social.addFriend(await requireUser(context), request), context);
  },

  /** Lists the caller's friends (with net balances). */
  async listFriends(_request, context) {
    return runUsecase(async () => ({ friends: await social.listFriends(await requireUser(context)) }), context);
  },

  /** Lists the activity feed, scoped to one group when groupId is set. */
  async listActivity(request, context) {
    return runUsecase(
      async () => ({
        events: await social.listActivity(await requireUser(context), request.groupId || undefined),
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
};

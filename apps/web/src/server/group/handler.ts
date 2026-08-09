/** Thin GroupService Connect handlers; logic lives in group.usecase. */

import type { ServiceImpl } from "@connectrpc/connect";
import type { GroupService } from "@haalkhata/protogen/group/v1/group_pb";
import * as groups from "@/server/group/usecase/group.usecase";
import { requireUser, runUsecase } from "@/server/api/connect/context";

/**
 * ConnectRPC implementation of GroupService. Each method authenticates the
 * caller via {@link requireUser} and delegates to the group usecase inside
 * {@link runUsecase}, which maps UsecaseError to ConnectError.
 */
export const groupHandler: ServiceImpl<typeof GroupService> = {
  /** Creates a new group owned by the caller. */
  async createGroup(request, context) {
    return runUsecase(async () => groups.createGroup(await requireUser(context), request), context);
  },

  /** Lists the caller's groups with member counts and the caller's net balance. */
  async listGroups(_request, context) {
    return runUsecase(async () => ({ groups: await groups.listGroups(await requireUser(context)) }), context);
  },

  /** Fetches a single group (with members) the caller belongs to. */
  async getGroup(request, context) {
    return runUsecase(async () => groups.getGroup(await requireUser(context), request.groupId), context);
  },

  /** Adds people by id, plus one optional email/phone newcomer as a shadow user. */
  async addMembers(request, context) {
    return runUsecase(async () => groups.addMembers(await requireUser(context), request), context);
  },

  /** Turns debt simplification on or off for the whole group; any member may. */
  async setSimplifyDebts(request, context) {
    return runUsecase(
      async () =>
        groups.setSimplifyDebts(await requireUser(context), {
          groupId: request.groupId,
          simplify: request.simplify,
        }),
      context,
    );
  },

  /** Removes a member from a group; refused while the member has a balance. */
  async removeMember(request, context) {
    await runUsecase(
      async () =>
        groups.removeMemberFromGroup(await requireUser(context), {
          groupId: request.groupId,
          userId: request.userId,
        }),
      context,
    );
    return {};
  },
};

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
    return runUsecase(async () => groups.createGroup(await requireUser(context), request));
  },

  /** Lists the caller's groups with member counts and the caller's net balance. */
  async listGroups(_request, context) {
    return runUsecase(async () => ({ groups: await groups.listGroups(await requireUser(context)) }));
  },

  /** Fetches a single group (with members) the caller belongs to. */
  async getGroup(request, context) {
    return runUsecase(async () => groups.getGroup(await requireUser(context), request.groupId));
  },

  /** Adds a member to a group by email, creating a shadow user if needed. */
  async addMember(request, context) {
    return runUsecase(async () => groups.addMemberByEmail(await requireUser(context), request));
  },

  /** Removes a member from a group; refused while the member has a balance. */
  async removeMember(request, context) {
    await runUsecase(async () =>
      groups.removeMemberFromGroup(await requireUser(context), {
        groupId: request.groupId,
        userId: request.userId,
      }),
    );
    return {};
  },
};

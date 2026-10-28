/** Thin authenticated SafetyService handlers. */

import type { ServiceImpl } from "@connectrpc/connect";
import type { SafetyService } from "@haalkhata/protogen/safety/v1/safety_pb";
import { requireUser, runUsecase } from "@/server/api/connect/context";
import { requireRateLimitedUser } from "@/server/api/connect/rateLimit/rpcRateLimit";
import { SAFETY_WRITE_LIMIT } from "./safety.constants";
import * as safety from "./usecase/safety.usecase";

/** Caller-owned safety controls; mutations share a bounded per-account bucket. */
export const safetyHandler: ServiceImpl<typeof SafetyService> = {
  /** Saves an authorized report. */
  async reportContent(request, context) {
    await runUsecase(async () => safety.reportContent(await requireRateLimitedUser(context, "safety", SAFETY_WRITE_LIMIT), request), context);
    return {};
  },
  /** Blocks a visible person regardless of balances. */
  async blockUser(request, context) {
    await runUsecase(async () => safety.blockUser(await requireRateLimitedUser(context, "safety", SAFETY_WRITE_LIMIT), request.userId), context);
    return {};
  },
  /** Removes the caller's own block. */
  async unblockUser(request, context) {
    await runUsecase(async () => safety.unblockUser(await requireRateLimitedUser(context, "safety", SAFETY_WRITE_LIMIT), request.userId), context);
    return {};
  },
  /** Returns the caller's private block list. */
  async listBlockedUsers(_request, context) {
    return runUsecase(async () => safety.listBlockedUsers(await requireUser(context)), context);
  },
};

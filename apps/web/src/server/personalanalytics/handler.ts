/** Thin PersonalAnalyticsService Connect handler; logic lives in insights.usecase. */

import type { ServiceImpl } from "@connectrpc/connect";
import type { PersonalAnalyticsService } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { runUsecase } from "@/server/api/connect/context";
import { requireRateLimitedUser, RPC_RATE_LIMITS } from "@/server/api/connect/rateLimit/rpcRateLimit";
import { getInsights } from "@/server/personalanalytics/usecase/insights.usecase";

/**
 * ConnectRPC implementation of PersonalAnalyticsService. The one method
 * authenticates the caller, charges their per-account bucket, and delegates.
 */
export const personalAnalyticsHandler: ServiceImpl<typeof PersonalAnalyticsService> = {
  /** The caller's own insights; rate-limited because it aggregates their whole window. */
  async getInsights(request, context) {
    return runUsecase(
      async () =>
        getInsights(
          await requireRateLimitedUser(context, "get-insights", RPC_RATE_LIMITS.getInsights),
          { months: request.months, localMonth: request.localMonth },
        ),
      context,
    );
  },
};

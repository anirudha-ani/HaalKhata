/**
 * Thin AdminModerationService Connect handlers: the surface and origin
 * checks, the admin session and the rate limits live here; the logic is in
 * moderation.usecase.
 */

import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import type { AdminModerationService } from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";
import { adminSessionToken, requireAdminPageRequest } from "@/server/api/connect/adminRequest";
import { runUsecase } from "@/server/api/connect/context";
import { rateLimitCheck } from "@/server/common/rateLimit/rateLimit";
import { requireAdminSession } from "@/server/adminanalytics/usecase/adminSession.usecase";
import {
  MODERATION_READ_RATE_LIMIT,
  MODERATION_WRITE_RATE_LIMIT,
} from "@/server/adminmoderation/adminmoderation.constants";
import * as moderation from "@/server/adminmoderation/usecase/moderation.usecase";

/**
 * Runs one moderation method: the request must come from the admin page on
 * the admin host, carry a live admin session, and fit the rate limit, in
 * that order, before the usecase runs. The order matters: nothing is
 * counted against the limit, and no session is looked up, for a request
 * that should not be here at all.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @param bucket - Rate-limit bucket and its per-minute ceiling.
 * @param operation - The usecase call.
 * @returns What the usecase returns.
 */
async function moderate<Result>(
  handlerContext: HandlerContext,
  bucket: { key: string; limit: number },
  operation: () => Promise<Result>,
): Promise<Result> {
  requireAdminPageRequest(handlerContext);
  return runUsecase(async () => {
    await requireAdminSession(adminSessionToken(handlerContext));
    if (!rateLimitCheck(bucket.key, bucket.limit)) {
      throw new ConnectError("too many requests, please try again later", Code.ResourceExhausted);
    }
    return operation();
  }, handlerContext);
}

/** The shared bucket every moderation action draws from. */
const WRITE_BUCKET = { key: "admin-moderation-write", limit: MODERATION_WRITE_RATE_LIMIT };

/** AdminModerationService implementation. */
export const adminModerationHandler: ServiceImpl<typeof AdminModerationService> = {
  /** The queue and the suspended accounts. */
  async listReports(_request, handlerContext) {
    return moderate(
      handlerContext,
      { key: "admin-moderation-read", limit: MODERATION_READ_RATE_LIMIT },
      () => moderation.listReports(),
    );
  },

  /** Closes the reports about one piece of content and keeps the content. */
  async dismissReport(request, handlerContext) {
    await moderate(handlerContext, WRITE_BUCKET, () => moderation.dismissReport(request.reportId));
    return {};
  },

  /** Removes the reported content and closes the reports about it. */
  async removeReportedContent(request, handlerContext) {
    await moderate(handlerContext, WRITE_BUCKET, () =>
      moderation.removeReportedContent(request.reportId),
    );
    return {};
  },

  /** Suspends the author of the reported content. */
  async suspendAuthor(request, handlerContext) {
    await moderate(handlerContext, WRITE_BUCKET, () => moderation.suspendAuthor(request.reportId));
    return {};
  },

  /** Lifts the author's suspension. */
  async resumeAuthor(request, handlerContext) {
    await moderate(handlerContext, WRITE_BUCKET, () => moderation.resumeAuthor(request.reportId));
    return {};
  },
};

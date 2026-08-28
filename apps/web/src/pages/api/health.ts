/** Readiness endpoint that verifies production secrets, migrations, and database access. */

import type { NextApiRequest, NextApiResponse } from "next";
import { signPayload } from "@/server/auth/usecase/auth.usecase";
import { ensureMigrated, query } from "@/server/common/db";
import { logError } from "@/server/common/logger";

/** Response shape intentionally reveals no component-level failure details. */
interface HealthResponse {
  status: "ok" | "unavailable";
}

/**
 * Reports ready only after token signing, migrations, and a live database
 * round-trip all succeed. Failed checks are logged server-side and collapsed
 * into one generic response so the public endpoint is not a diagnostics oracle.
 *
 * @param request - Incoming Next.js health-check request.
 * @param response - Next.js response used to report readiness.
 */
export default async function healthHandler(
  request: NextApiRequest,
  response: NextApiResponse<HealthResponse>,
): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Allow", "GET, HEAD");
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.status(405).json({ status: "unavailable" });
    return;
  }

  try {
    signPayload("session", "healthcheck");
    await ensureMigrated();
    await query("SELECT 1");
    response.status(200).json({ status: "ok" });
  } catch (error) {
    logError(error, { scope: "readiness-check" });
    response.status(503).json({ status: "unavailable" });
  }
}

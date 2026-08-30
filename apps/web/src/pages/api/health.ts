/** Readiness endpoint that verifies production secrets, sign-in configuration, migrations, and database access. */

import type { NextApiRequest, NextApiResponse } from "next";
import { signPayload } from "@/server/auth/usecase/auth.usecase";
import {
  GOOGLE_AUDIENCES,
  GOOGLE_CLIENT_ID,
  passwordAuthEnabled,
} from "@/server/auth/auth.constants";
import { ensureMigrated, query } from "@/server/common/db";
import { logError } from "@/server/common/logger";

/** Response shape intentionally reveals no component-level failure details. */
interface HealthResponse {
  status: "ok" | "unavailable";
}

/**
 * Refuses readiness when nobody could sign in.
 *
 * Production accepts Google alone, so a stack whose server has no client id
 * — or whose browser bundle was built for a different one than the server
 * accepts — starts, answers the database check, and locks every signed-out
 * user out. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is inlined by `next build`, so
 * reading it here compares the id baked into the image against the one the
 * runtime was given.
 *
 * @throws Error naming the misconfiguration, for the log only.
 */
function assertSignInConfigured(): void {
  if (passwordAuthEnabled()) return;
  if (GOOGLE_AUDIENCES.length === 0) {
    throw new Error("sign-in is not configured: GOOGLE_CLIENT_ID is unset and password auth is off");
  }
  const builtClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  if (builtClientId === "") {
    throw new Error(
      "sign-in is not configured: the image was built without NEXT_PUBLIC_GOOGLE_CLIENT_ID, so the Google button never appears",
    );
  }
  if (builtClientId !== GOOGLE_CLIENT_ID) {
    throw new Error(
      "sign-in is misconfigured: the browser was built for a different Google client id than the server accepts",
    );
  }
}

/**
 * Reports ready only after token signing, sign-in configuration,
 * migrations, and a live database round-trip all succeed. Failed checks are
 * logged server-side and collapsed into one generic response so the public
 * endpoint is not a diagnostics oracle.
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
    assertSignInConfigured();
    await ensureMigrated();
    await query("SELECT 1");
    response.status(200).json({ status: "ok" });
  } catch (error) {
    logError(error, { scope: "readiness-check" });
    response.status(503).json({ status: "unavailable" });
  }
}

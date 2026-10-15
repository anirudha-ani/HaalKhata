/** Build preflight endpoint verifies the deployed backend supports this mobile release. */

import type { NextApiRequest, NextApiResponse } from "next";
import { ensureMigrated, query } from "@/server/common/db/db";
import { mobileReleaseInfo } from "@/server/common/readiness/mobileRelease";
import { logError } from "@/server/common/logger";

/**
 * Provides public release capabilities after configuration and database readiness checks.
 * @param request Read-only build preflight request.
 * @param response Capabilities or sanitized unavailability.
 */
export default async function mobileRelease(request: NextApiRequest, response: NextApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") { response.setHeader("Allow", "GET"); response.status(405).end(); return; }
  try {
    const information = await mobileReleaseInfo();
    await ensureMigrated(); await query("SELECT 1");
    response.status(200).json(information);
  } catch (failure) { logError(failure, { scope: "mobile-release-preflight" }); response.status(503).json({ status: "unavailable" }); }
}

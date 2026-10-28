/** Next.js catch-all API route mounting the Connect router under /api/connect. */

import type { NextApiRequest, NextApiResponse } from "next";
import { nextJsApiRouter } from "@connectrpc/connect-next";
import routes from "@/server/api/connect/routes";
import { csrfGuard } from "@/server/api/connect/mount/csrf";
import { ensureMigrated } from "@/server/common/db/db";
import { CONNECT_MOUNT_OPTIONS } from "@/server/api/connect/mount/mountOptions";
import { enforceBodyDeadline } from "@/server/api/connect/mount/bodyDeadline";
import {
  BODY_READ_TIMEOUT_MS,
  RECEIPT_BODY_READ_TIMEOUT_MS,
  RECEIPT_SERVICE_PATH,
} from "@/server/api/connect/connect.constants";
import { logError } from "@/server/common/logger";
import { DIRECT_CLIENT_IP_HEADER } from "@/server/auth/request/clientIp";
import { rpcAllowedOnSurface } from "@/config/adminSurface";

/** Next.js API handler that serves every registered Connect RPC under /api/connect. */
const { handler } = nextJsApiRouter({
  routes,
  prefix: "/api/connect",
  ...CONNECT_MOUNT_OPTIONS,
});

/**
 * Wraps the Connect handler with the surface gate, a CSRF guard, a deadline
 * for the request body and a one-shot migration wait.
 */
export default async function connectHandler(request: NextApiRequest, response: NextApiResponse) {
  // First, before anything reads a cookie or touches the database: the admin
  // hostname serves the admin service and nothing else, and the app's
  // hostname serves everything but. An RPC on the wrong one does not exist.
  if (!rpcAllowedOnSurface(request.url, request.headers.host)) {
    response.status(404).json({ error: "not found" });
    return;
  }
  // Always overwrite the internal header: direct deployments get the actual
  // socket peer, and a caller cannot smuggle a fake fallback through Caddy.
  request.headers[DIRECT_CLIENT_IP_HEADER] = request.socket?.remoteAddress ?? "";
  if (!csrfGuard(request, response)) return;
  // From here the body may be read: it has to arrive in time, receipts
  // (a photo) given longer than everything else.
  enforceBodyDeadline(
    request,
    response,
    request.url?.includes(RECEIPT_SERVICE_PATH) ? RECEIPT_BODY_READ_TIMEOUT_MS : BODY_READ_TIMEOUT_MS,
  );
  try {
    // ensureMigrated caches a successful/in-flight run process-wide and clears
    // its cache on failure. Calling it here makes that retry path reachable on
    // the next request instead of poisoning this route until process restart.
    await ensureMigrated();
  } catch (error) {
    logError(error, { scope: "database-migration" });
    response.status(503).json({ error: "service temporarily unavailable" });
    return;
  }
  return handler(request, response);
}

/** Connect parses request bodies itself; Next's body parser must be off. */
export const config = {
  api: {
    bodyParser: false,
  },
};

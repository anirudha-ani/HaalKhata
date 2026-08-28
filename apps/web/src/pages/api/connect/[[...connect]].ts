/** Next.js catch-all API route mounting the Connect router under /api/connect. */

import type { NextApiRequest, NextApiResponse } from "next";
import { nextJsApiRouter } from "@connectrpc/connect-next";
import routes from "@/server/api/connect/routes";
import { csrfGuard } from "@/server/api/connect/csrf";
import { ensureMigrated } from "@/server/common/db";
import { CONNECT_READ_MAX_BYTES } from "@/server/api/connect/connect.constants";
import { logError } from "@/server/common/logger";

/** Next.js API handler that serves every registered Connect RPC under /api/connect. */
const { handler } = nextJsApiRouter({
  routes,
  prefix: "/api/connect",
  readMaxBytes: CONNECT_READ_MAX_BYTES,
});

/**
 * Wraps the Connect handler with a CSRF guard and a one-shot migration wait.
 */
export default async function connectHandler(request: NextApiRequest, response: NextApiResponse) {
  if (!csrfGuard(request, response)) return;
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

/** Next.js catch-all API route mounting the Connect router under /api/connect. */

import type { NextApiRequest, NextApiResponse } from "next";
import { nextJsApiRouter } from "@connectrpc/connect-next";
import routes from "@/server/api/connect/routes";
import { csrfGuard } from "@/server/api/connect/csrf";
import { ensureMigrated } from "@/server/common/db";
import { CONNECT_READ_MAX_BYTES } from "@/server/api/connect/connect.constants";

/** Next.js API handler that serves every registered Connect RPC under /api/connect. */
const { handler } = nextJsApiRouter({
  routes,
  prefix: "/api/connect",
  readMaxBytes: CONNECT_READ_MAX_BYTES,
});

// Run pending migrations once per process before serving the first request.
// Cached on the global so subsequent requests skip it. This keeps migrations
// out of the per-query hot path while staying zero-step for dev/Docker.
const migrationPromise = ensureMigrated();

/**
 * Wraps the Connect handler with a CSRF guard and a one-shot migration wait.
 */
export default async function connectHandler(request: NextApiRequest, response: NextApiResponse) {
  if (!csrfGuard(request, response)) return;
  await migrationPromise;
  return handler(request, response);
}

/** Connect parses request bodies itself; Next's body parser must be off. */
export const config = {
  api: {
    bodyParser: false,
  },
};

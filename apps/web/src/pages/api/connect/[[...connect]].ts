/** Next.js catch-all API route mounting the Connect router under /api/connect. */

import type { NextApiRequest, NextApiResponse } from "next";
import { nextJsApiRouter } from "@connectrpc/connect-next";
import routes from "@/server/api/connect/routes";
import { csrfGuard } from "@/server/api/connect/csrf";

/** Next.js API handler that serves every registered Connect RPC under /api/connect. */
const { handler } = nextJsApiRouter({ routes, prefix: "/api/connect" });

/**
 * Wraps the Connect handler with a CSRF guard that rejects cookie-bearing,
 * state-changing requests whose Origin does not match the app's own host.
 */
export default function connectHandler(request: NextApiRequest, response: NextApiResponse) {
  if (!csrfGuard(request, response)) return;
  return handler(request, response);
}

/** Connect parses request bodies itself; Next's body parser must be off. */
export const config = {
  api: {
    bodyParser: false,
  },
};

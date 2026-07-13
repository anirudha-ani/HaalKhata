/** Next.js catch-all API route mounting the Connect router under /api/connect. */

import { nextJsApiRouter } from "@connectrpc/connect-next";
import routes from "@/server/api/connect/routes";

/** Next.js API handler that serves every registered Connect RPC under /api/connect. */
const { handler } = nextJsApiRouter({ routes, prefix: "/api/connect" });

export default handler;

/** Connect parses request bodies itself; Next's body parser must be off. */
export const config = {
  api: {
    bodyParser: false,
  },
};

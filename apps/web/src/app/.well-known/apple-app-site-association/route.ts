/** Public, non-redirecting iOS universal-link association. */

import { appleAppAssociation } from "@/server/common/mobileRelease";

/** Association settings are resolved from runtime deployment configuration. */
export const dynamic = "force-dynamic";

/**
 * Serves the actual signing prefix rather than a committed placeholder.
 * @returns Apple association JSON, or a fail-closed unavailable response.
 */
// eslint-disable-next-line id-length -- Next.js requires this HTTP method export name.
export function GET() {
  const association = appleAppAssociation();
  return Response.json(association ?? { error: "app association is not configured" }, {
    status: association ? 200 : 503, headers: { "Cache-Control": association ? "public, max-age=3600" : "no-store" },
  });
}

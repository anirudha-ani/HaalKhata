/** Public Android verified-link claims using configured signing fingerprints. */

import { androidAssetLinks } from "@/server/common/mobileRelease";

/** Resolve signing fingerprints at request time. */
export const dynamic = "force-dynamic";

/**
 * Serves Digital Asset Links without redirecting through the login page.
 * @returns Verified-link JSON, or unavailable until Android signing is configured.
 */
// eslint-disable-next-line id-length -- Next.js requires this HTTP method export name.
export function GET() {
  const association = androidAssetLinks();
  return Response.json(association ?? { error: "Android signing is not configured" }, {
    status: association ? 200 : 503, headers: { "Cache-Control": association ? "public, max-age=3600" : "no-store" },
  });
}

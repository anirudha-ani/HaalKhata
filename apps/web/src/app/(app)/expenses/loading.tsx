/** Route loading UI for /expenses. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders the spinner shown while the /expenses route segment is loading.
 *
 * @returns A spinner labelled "Loading expenses…".
 */
export default function Loading() {
  return <Spinner label="Loading expenses…" />;
}

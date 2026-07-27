/** Route loading UI for /friends/[id]. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders the spinner shown while the /friends/[id] route segment is loading.
 *
 * @returns A spinner labelled "Loading…".
 */
export default function Loading() {
  return <Spinner label="Loading…" />;
}

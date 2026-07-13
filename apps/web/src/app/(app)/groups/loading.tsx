/** Route loading UI for /groups. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders the spinner shown while the /groups route segment is loading.
 *
 * @returns A spinner labelled "Loading groups…".
 */
export default function Loading() {
  return <Spinner label="Loading groups…" />;
}

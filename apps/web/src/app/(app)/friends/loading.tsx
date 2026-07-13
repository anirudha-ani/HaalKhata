/** Route loading UI for /friends. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders the spinner shown while the /friends route segment is loading.
 *
 * @returns A spinner labelled "Loading friends…".
 */
export default function Loading() {
  return <Spinner label="Loading friends…" />;
}

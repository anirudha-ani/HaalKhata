/** Route loading UI for /groups/[id]. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders the spinner shown while the /groups/[id] route segment is loading.
 *
 * @returns A spinner labelled "Loading group…".
 */
export default function Loading() {
  return <Spinner label="Loading group…" />;
}

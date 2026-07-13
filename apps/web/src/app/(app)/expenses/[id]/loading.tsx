/** Loading UI for the /expenses/[id] route. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders a labelled spinner while the /expenses/[id] route segment loads.
 *
 * @returns The route-level loading indicator.
 */
export default function Loading() {
  return <Spinner label="Loading expense…" />;
}

/** Loading UI for the /activity route. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders a labelled spinner while the /activity route segment loads.
 *
 * @returns The route-level loading indicator.
 */
export default function Loading() {
  return <Spinner label="Loading activity…" />;
}

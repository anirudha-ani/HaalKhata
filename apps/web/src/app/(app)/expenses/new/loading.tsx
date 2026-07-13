/** Loading UI for the /expenses/new route. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders a spinner while the /expenses/new route segment loads.
 *
 * @returns The route-level loading indicator.
 */
export default function Loading() {
  return <Spinner />;
}

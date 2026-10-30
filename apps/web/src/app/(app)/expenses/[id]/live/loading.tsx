/** Loading UI for the /expenses/[id]/live route. */

import { Spinner } from "@/components/ui/Spinner/Spinner";

/**
 * Renders a labelled spinner while the /expenses/[id]/live route segment loads.
 *
 * @returns The route-level loading indicator.
 */
export default function Loading() {
  return <Spinner label="Loading the bill…" />;
}

/** Loading UI for the /dashboard route. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders a labelled spinner while the /dashboard route segment loads.
 *
 * @returns The route-level loading indicator.
 */
export default function Loading() {
  return <Spinner label="Opening your ledger…" />;
}

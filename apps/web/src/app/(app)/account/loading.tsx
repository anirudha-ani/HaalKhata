/** Loading UI for the /account route. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders a spinner while the /account route segment loads.
 *
 * @returns The route-level loading indicator.
 */
export default function Loading() {
  return <Spinner />;
}

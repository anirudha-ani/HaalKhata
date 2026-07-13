/** Route loading UI for /scan. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders the spinner shown while the /scan route segment is loading.
 *
 * @returns An unlabelled spinner.
 */
export default function Loading() {
  return <Spinner />;
}

/** Route loading UI for /admin. */

import { Spinner } from "@/components/ui/Spinner/Spinner";

/**
 * Renders the spinner shown while the /admin route segment is loading.
 *
 * @returns An unlabelled spinner.
 */
export default function Loading() {
  return <Spinner />;
}

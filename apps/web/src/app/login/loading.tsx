/** Route loading UI for /login. */

import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders the spinner shown while the /login route segment is loading.
 *
 * @returns An unlabelled spinner.
 */
export default function Loading() {
  return <Spinner />;
}

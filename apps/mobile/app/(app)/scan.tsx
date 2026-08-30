/** /scan: kept as a redirect into the expense form, which now owns scanning. */

import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Forwards /scan to the expense form, carrying ?group / ?friend across.
 *
 * Scanning stopped being a destination: a scanned receipt and a hand-entered
 * itemized bill save the identical row, so the photo is an input to the
 * expense form rather than a screen beside it — the same move the web made.
 * This redirect stays so any link written before the merge keeps working.
 *
 * @returns A redirect to /expenses/new with the scope params preserved.
 */
export default function Scan() {
  const params = useLocalSearchParams<{ group?: string; friend?: string }>();
  const suffix = params.group
    ? `?group=${params.group}`
    : params.friend
      ? `?friend=${params.friend}`
      : "";
  return <Redirect href={`/expenses/new${suffix}`} />;
}

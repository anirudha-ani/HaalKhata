/** /scan: kept as a redirect into the expense form, which now owns scanning. */

import { redirect } from "next/navigation";

/**
 * Forwards /scan to the expense form, carrying ?group / ?friend across.
 *
 * Scanning stopped being a destination in §3j: a scanned receipt and a
 * hand-entered itemized bill save the identical row, so the photo is an input
 * to the expense form rather than a route beside it. This redirect stays so
 * bookmarks and any link written before the merge keep working.
 *
 * @param props - Next.js page props.
 * @param props.searchParams - Promise resolving to the query string params;
 *   `group` optionally names the group to preselect, `friend` a person to
 *   start the expense with.
 * @returns Never — always redirects.
 */
export default async function Scan({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; friend?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.group) query.set("group", params.group);
  else if (params.friend) query.set("friend", params.friend);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/expenses/new${suffix}`);
}

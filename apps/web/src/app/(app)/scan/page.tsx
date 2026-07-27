/** /scan route: reads the optional ?group / ?friend search params and renders ScanPage. */

import { ScanPage } from "./components/ScanPage/ScanPage";

/**
 * Server entry point for the /scan route; awaits the search params and renders
 * the ScanPage client component, preselecting the group from ?group or seeding
 * the one-off cast from ?friend.
 *
 * @param props - Next.js page props.
 * @param props.searchParams - Promise resolving to the query string params;
 *   `group` optionally names the group to preselect, `friend` a person to
 *   start the receipt with.
 * @returns The scan page element.
 */
export default async function Scan({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; friend?: string }>;
}) {
  const params = await searchParams;
  return (
    <ScanPage
      initialGroupId={params.group ?? ""}
      initialFriendId={params.group ? "" : (params.friend ?? "")}
    />
  );
}

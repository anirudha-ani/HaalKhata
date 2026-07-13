/** /scan route: reads the optional ?group search param and renders ScanPage. */

import { ScanPage } from "./components/ScanPage/ScanPage";

/**
 * Server entry point for the /scan route; awaits the search params and renders
 * the ScanPage client component, preselecting the group from ?group if given.
 *
 * @param props - Next.js page props.
 * @param props.searchParams - Promise resolving to the query string params;
 *   `group` optionally names the group to preselect.
 * @returns The scan page element.
 */
export default async function Scan({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const params = await searchParams;
  return <ScanPage initialGroupId={params.group ?? ""} />;
}

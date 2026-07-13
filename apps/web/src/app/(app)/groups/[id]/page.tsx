/** /groups/[id] route: resolves the id param and renders GroupDetailPage. */

import { GroupDetailPage } from "./components/GroupDetailPage/GroupDetailPage";

/**
 * Server entry point for the /groups/[id] route; awaits the dynamic route
 * params and renders the GroupDetailPage client component for that group.
 *
 * @param props - Next.js page props.
 * @param props.params - Promise resolving to the dynamic route params, where
 *   `id` is the group identifier from the URL.
 * @returns The group detail page element.
 */
export default async function GroupDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: groupId } = await params;
  return <GroupDetailPage groupId={groupId} />;
}

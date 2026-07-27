/** /friends/[id] route: resolves the id param and renders FriendDetailPage. */

import { FriendDetailPage } from "./components/FriendDetailPage/FriendDetailPage";

/**
 * Server entry point for the /friends/[id] route; awaits the dynamic route
 * params and renders the FriendDetailPage client component for that person.
 *
 * @param props - Next.js page props.
 * @param props.params - Promise resolving to the dynamic route params, where
 *   `id` is the friend's user identifier from the URL.
 * @returns The friend detail page element.
 */
export default async function FriendDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: friendId } = await params;
  return <FriendDetailPage friendId={friendId} />;
}

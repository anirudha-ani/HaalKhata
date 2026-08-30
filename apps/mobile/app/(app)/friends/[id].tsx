/** /friends/[id] route: resolves the id param and renders FriendDetailScreen. */

import { useLocalSearchParams } from "expo-router";
import { FriendDetailScreen } from "@/screens/friendDetail/components/FriendDetailScreen/FriendDetailScreen";

/**
 * Resolves the dynamic route param and mounts the FriendDetailScreen for
 * that person's shared ledger.
 *
 * @returns The friend detail screen element.
 */
export default function FriendDetail() {
  const { id: friendId } = useLocalSearchParams<{ id: string }>();
  return <FriendDetailScreen friendId={friendId ?? ""} />;
}

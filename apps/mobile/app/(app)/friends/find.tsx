/** /friends/find route: mounts the Find friends screen. */

import { FindFriendsScreen } from "@/screens/findFriends/components/FindFriendsScreen/FindFriendsScreen";

/**
 * Mounts the screen that matches the caller's contacts against people on
 * HaalKhata.
 *
 * @returns The Find friends screen element.
 */
export default function FindFriends() {
  return <FindFriendsScreen />;
}

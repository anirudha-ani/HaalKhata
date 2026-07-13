/** /friends route: renders FriendsScreen. */

import { FriendsScreen } from "@/screens/friends/components/FriendsScreen/FriendsScreen";

/**
 * Renders the friends route by mounting the FriendsScreen orchestrator.
 *
 * @returns The /friends screen.
 */
export default function Friends() {
  return <FriendsScreen />;
}

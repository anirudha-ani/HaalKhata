/** /friends route: thin orchestrator rendering FriendsPage. */

import { FriendsPage } from "./components/FriendsPage/FriendsPage";

/**
 * Server entry point for the /friends route; renders the FriendsPage client
 * component.
 *
 * @returns The friends page element.
 */
export default function Friends() {
  return <FriendsPage />;
}

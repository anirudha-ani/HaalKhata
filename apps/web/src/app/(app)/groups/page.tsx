/** /groups route: thin orchestrator rendering GroupsPage. */

import { GroupsPage } from "./components/GroupsPage/GroupsPage";

/**
 * Server entry point for the /groups route; renders the GroupsPage client
 * component.
 *
 * @returns The groups page element.
 */
export default function Groups() {
  return <GroupsPage />;
}

/** /account route: renders AccountPage. */

import { AccountPage } from "./components/AccountPage/AccountPage";

/**
 * Renders the account route by mounting the AccountPage orchestrator.
 *
 * @returns The /account page.
 */
export default function Account() {
  return <AccountPage />;
}

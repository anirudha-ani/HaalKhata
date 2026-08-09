/** /expenses route: thin orchestrator rendering ExpensesPage. */

import { ExpensesPage } from "./components/ExpensesPage/ExpensesPage";

/**
 * Server entry point for the /expenses route; renders the ExpensesPage client
 * component.
 *
 * @returns The expenses page element.
 */
export default function Expenses() {
  return <ExpensesPage />;
}

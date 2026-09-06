/** /expenses route: renders ExpensesScreen. */

import { ExpensesScreen } from "@/screens/expenses/components/ExpensesScreen/ExpensesScreen";

/**
 * Renders the all-expenses route by mounting the ExpensesScreen orchestrator.
 *
 * @returns The /expenses screen.
 */
export default function Expenses() {
  return <ExpensesScreen />;
}

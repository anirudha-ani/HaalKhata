/** /expenses/[id] route: resolves the id param and renders ExpenseDetailScreen. */

import { useLocalSearchParams } from "expo-router";
import { ExpenseDetailScreen } from "@/screens/expenseDetail/components/ExpenseDetailScreen/ExpenseDetailScreen";

/**
 * Resolves the dynamic route param and mounts the ExpenseDetailScreen for
 * that expense.
 *
 * @returns The expense detail screen element.
 */
export default function ExpenseDetail() {
  const { id: expenseId } = useLocalSearchParams<{ id: string }>();
  return <ExpenseDetailScreen expenseId={expenseId ?? ""} />;
}

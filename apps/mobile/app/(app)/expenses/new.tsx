/** /expenses/new route: reads group/friend/edit params and renders NewExpenseScreen. */

import { useLocalSearchParams } from "expo-router";
import { NewExpenseScreen } from "@/screens/newExpense/components/NewExpenseScreen/NewExpenseScreen";

/**
 * Resolves the search params and mounts the new/edit expense screen.
 *
 * @returns The /expenses/new screen.
 */
export default function NewExpense() {
  const params = useLocalSearchParams<{ group?: string; friend?: string; edit?: string }>();
  return (
    <NewExpenseScreen
      editExpenseId={params.edit ?? ""}
      initialFriendId={params.friend ?? ""}
      initialGroupId={params.group ?? ""}
    />
  );
}

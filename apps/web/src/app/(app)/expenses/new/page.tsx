/** /expenses/new route: reads group/friend/edit search params and renders NewExpensePage. */

import { NewExpensePage } from "./components/NewExpensePage/NewExpensePage";

/**
 * Resolves the search params and mounts the new/edit expense page.
 *
 * @param props - Route props.
 * @param props.searchParams - Promise resolving to the optional `group`,
 *   `friend`, and `edit` search params.
 * @returns The /expenses/new page.
 */
export default async function NewExpense({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; friend?: string; edit?: string }>;
}) {
  const params = await searchParams;
  return (
    <NewExpensePage
      initialGroupId={params.group ?? ""}
      initialFriendId={params.friend ?? ""}
      editExpenseId={params.edit ?? ""}
    />
  );
}

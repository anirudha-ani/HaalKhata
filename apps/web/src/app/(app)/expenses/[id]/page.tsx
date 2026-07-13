/** /expenses/[id] route: resolves the id param and renders ExpenseDetailPage. */

import { ExpenseDetailPage } from "./components/ExpenseDetailPage/ExpenseDetailPage";

/**
 * Resolves the dynamic route param and mounts the expense detail page.
 *
 * @param props - Route props.
 * @param props.params - Promise resolving to the dynamic segment values (`id`).
 * @returns The /expenses/[id] page.
 */
export default async function ExpenseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: expenseId } = await params;
  return <ExpenseDetailPage expenseId={expenseId} />;
}

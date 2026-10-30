/** /expenses/[id]/live route: resolves the id param and renders LiveSplitPage. */

import { LiveSplitPage } from "./components/LiveSplitPage/LiveSplitPage";

/**
 * Resolves the dynamic route param and mounts the live split page.
 *
 * @param props - Route props.
 * @param props.params - Promise resolving to the dynamic segment values (`id`).
 * @returns The /expenses/[id]/live page.
 */
export default async function LiveSplit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: expenseId } = await params;
  return <LiveSplitPage expenseId={expenseId} />;
}

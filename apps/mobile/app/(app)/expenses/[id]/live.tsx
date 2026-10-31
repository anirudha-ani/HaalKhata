/** /expenses/[id]/live route: resolves the id param and renders LiveSplitScreen. */

import { useLocalSearchParams } from "expo-router";
import { LiveSplitScreen } from "@/screens/liveSplit/components/LiveSplitScreen/LiveSplitScreen";

/**
 * Resolves the dynamic route param and mounts the live split screen.
 *
 * @returns The live split screen element.
 */
export default function LiveSplit() {
  const { id: expenseId } = useLocalSearchParams<{ id: string }>();
  return <LiveSplitScreen expenseId={expenseId ?? ""} />;
}

/** /groups/[id] route: resolves the id param and renders GroupDetailScreen. */

import { useLocalSearchParams } from "expo-router";
import { GroupDetailScreen } from "@/screens/groupDetail/components/GroupDetailScreen/GroupDetailScreen";

/**
 * Resolves the dynamic route param and mounts the GroupDetailScreen for that
 * group.
 *
 * @returns The group detail screen element.
 */
export default function GroupDetail() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  return <GroupDetailScreen groupId={groupId ?? ""} />;
}

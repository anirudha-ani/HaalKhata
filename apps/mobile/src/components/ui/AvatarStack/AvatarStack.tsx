/** Avatar stack: overlapping avatars in a fixed number of slots, the overflow shown as "+N". */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { capStack } from "@haalkhata/shared/people/capStack";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import { AVATAR_SIZES } from "@/components/ui/ui.constants";
import { colors } from "@/lib/theme/theme";
import { AVATAR_STACK_OVERLAP } from "./constants/avatarStack";

/**
 * Renders people as a row of overlapping avatars that never grows past
 * `slots` circles. A stack that draws everyone cannot shrink, so with a
 * dozen people it either pushes its neighbours out of the row or paints over
 * them; this one stops at a known width and counts the rest.
 *
 * The hidden people stay reachable: a stack is always a summary beside a
 * way into the full list, which is what the count is read as.
 *
 * @param props - Component props.
 * @returns The stack, or an empty row when there is nobody to show.
 */
export function AvatarStack({
  users,
  slots,
  size = "sm",
}: {
  /** The people to show, in display order. */
  users: Pick<User, "id" | "name" | "avatarColor" | "avatarUrl">[];
  /** How many circles the stack may take, the "+N" count included. */
  slots: number;
  /** Avatar size variant; defaults to "sm". */
  size?: keyof typeof AVATAR_SIZES;
}) {
  const { shown, hiddenCount } = capStack(users, slots);
  const dimensions = AVATAR_SIZES[size];
  return (
    <View style={styles.stack}>
      {shown.map((user, index) => (
        <View key={user.id} style={index > 0 ? styles.overlap : null}>
          <Avatar ring size={size} user={user} />
        </View>
      ))}
      {hiddenCount > 0 ? (
        <View
          style={[
            styles.count,
            shown.length > 0 ? styles.overlap : null,
            {
              borderRadius: dimensions.diameter / 2,
              height: dimensions.diameter,
              minWidth: dimensions.diameter,
            },
          ]}
        >
          {/* Held at its size: a circle has no room for Dynamic Type to grow "+12" into. */}
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[styles.countText, { fontSize: dimensions.fontSize }]}
          >
            +{hiddenCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  count: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderColor: colors.card,
    borderWidth: 2,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  countText: {
    color: colors.inkSoft,
    fontWeight: "600",
  },
  overlap: {
    marginLeft: -AVATAR_STACK_OVERLAP,
  },
  stack: {
    flexDirection: "row",
    flexShrink: 0,
  },
});

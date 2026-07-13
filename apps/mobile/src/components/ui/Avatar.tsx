/** Initials avatar circle tinted with the user's avatarColor. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme/theme";
import { AVATAR_FALLBACK_COLOR, AVATAR_SIZES } from "./ui.constants";

/**
 * Renders a circular avatar showing the user's initials (up to two) on a
 * background tinted with the user's avatarColor.
 */
export function Avatar({
  user,
  size = "md",
  ring = false,
}: {
  /** The user to represent; only `name` and `avatarColor` are used. */
  user: Pick<User, "name" | "avatarColor">;
  /** Size variant; defaults to "md". */
  size?: keyof typeof AVATAR_SIZES;
  /** Whether to draw a card-colored ring around the circle (for overlapping stacks). */
  ring?: boolean;
}) {
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const dimensions = AVATAR_SIZES[size];
  return (
    <View
      style={[
        styles.circle,
        {
          backgroundColor: user.avatarColor || AVATAR_FALLBACK_COLOR,
          borderRadius: dimensions.diameter / 2,
          height: dimensions.diameter,
          width: dimensions.diameter,
        },
        ring ? styles.ring : null,
      ]}
    >
      <Text style={[styles.initials, { fontSize: dimensions.fontSize }]}>{initials || "?"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center",
  },
  initials: {
    color: colors.white,
    fontWeight: "600",
  },
  ring: {
    borderColor: colors.card,
    borderWidth: 2,
  },
});

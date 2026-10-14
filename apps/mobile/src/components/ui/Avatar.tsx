/** Avatar circle: the person's Google picture, falling back to tinted initials. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { StyleSheet, View } from "react-native";
import { colors } from "@/lib/theme/theme";
import { AvatarPicture } from "./AvatarPicture/AvatarPicture";
import { AVATAR_FALLBACK_COLOR, AVATAR_SIZES } from "./ui.constants";

/**
 * Renders a circular avatar. Shows the person's Google profile picture when
 * there is one, and their initials on a background tinted with avatarColor
 * otherwise.
 *
 * The initials are not a legacy path: `avatarUrl` is empty for everyone who
 * was invited rather than signed in, and Google's picture claim is documented
 * as never guaranteed even for those who did. A picture that fails to load
 * falls back to the same initials rather than an empty square.
 */
export function Avatar({
  user,
  size = "md",
  ring = false,
}: {
  /** The user's identity, display name, tint and profile picture. */
  user: Pick<User, "id" | "name" | "avatarColor" | "avatarUrl">;
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
      {/* A fresh native image and failure state for each person/photo pair. */}
      <AvatarPicture
        key={JSON.stringify([user.id, user.avatarUrl])}
        avatarUrl={user.avatarUrl}
        initials={initials || "?"}
        dimensions={dimensions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center",
  },
  ring: {
    borderColor: colors.card,
    borderWidth: 2,
  },
});

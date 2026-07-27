/** Avatar circle: the person's Google picture, falling back to tinted initials. */

import { useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme/theme";
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
  /** The user to represent; `name`, `avatarColor` and `avatarUrl` are used. */
  user: Pick<User, "name" | "avatarColor" | "avatarUrl">;
  /** Size variant; defaults to "md". */
  size?: keyof typeof AVATAR_SIZES;
  /** Whether to draw a card-colored ring around the circle (for overlapping stacks). */
  ring?: boolean;
}) {
  const [pictureFailed, setPictureFailed] = useState(false);
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const dimensions = AVATAR_SIZES[size];
  const showPicture = user.avatarUrl.length > 0 && !pictureFailed;
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
      {showPicture ? (
        <Image
          source={{ uri: user.avatarUrl }}
          onError={() => setPictureFailed(true)}
          style={{
            borderRadius: dimensions.diameter / 2,
            height: dimensions.diameter,
            width: dimensions.diameter,
          }}
        />
      ) : (
        <Text style={[styles.initials, { fontSize: dimensions.fontSize }]}>{initials || "?"}</Text>
      )}
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

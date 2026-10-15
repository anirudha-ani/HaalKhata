/** Native image loading and fallback state for one person's one picture. */

import { useState } from "react";
import { Image, StyleSheet } from "react-native";
import { Text } from "@/components/ui/Text";
import { colors } from "@/lib/theme/theme";

/**
 * Displays a profile picture or initials after a failed load. The owner keys
 * this component by user ID and URL to isolate native images and load events.
 *
 * @param props - Picture URL, fallback initials and avatar dimensions.
 * @returns The picture, or initials when absent or unavailable.
 */
export function AvatarPicture({
  avatarUrl,
  initials,
  dimensions,
}: {
  avatarUrl: string;
  initials: string;
  dimensions: { diameter: number; fontSize: number };
}) {
  const [pictureFailed, setPictureFailed] = useState(false);
  if (!avatarUrl || pictureFailed) {
    return <Text style={[styles.initials, { fontSize: dimensions.fontSize }]}>{initials}</Text>;
  }

  return (
    <Image
      source={{ uri: avatarUrl }}
      onError={() => setPictureFailed(true)}
      style={{
        borderRadius: dimensions.diameter / 2,
        height: dimensions.diameter,
        width: dimensions.diameter,
      }}
    />
  );
}

const styles = StyleSheet.create({
  initials: {
    color: colors.white,
    fontWeight: "600",
  },
});

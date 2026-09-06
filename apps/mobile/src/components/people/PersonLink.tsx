/** Makes any rendering of a person navigate to who they are. */

import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";

/**
 * Wraps whatever shows a person — avatar, name, both — in a press that opens
 * their screen: the shared ledger for anyone else, your own account screen
 * for you.
 *
 * Exists so that a person on screen is never a dead end. The ledger screen
 * renders any pair (and carries its own add-friend affordance when there is
 * no friendship yet), so every name can afford to be a door.
 *
 * Not for use inside another pressable row — a feed row that already
 * navigates somewhere cannot nest this.
 *
 * @returns The children, wrapped in the person's press target.
 */
export function PersonLink({
  userId,
  meId,
  style,
  children,
}: {
  /** The person being shown. */
  userId: string;
  /** The signed-in user's id; matching ids open the account screen. */
  meId: string | undefined;
  /** Layout styles for the press target (e.g. a row's flex and gap). */
  style?: StyleProp<ViewStyle>;
  /** Whatever visual represents the person. */
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      hitSlop={4}
      onPress={() => router.push(userId === meId ? "/account" : `/friends/${userId}`)}
      style={({ pressed }) => [style, pressed ? { opacity: 0.7 } : null]}
    >
      {children}
    </Pressable>
  );
}

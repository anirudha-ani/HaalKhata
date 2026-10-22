/** A small address book in which two contacts light up as being on HaalKhata. */

import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import { popInAfter, riseIn } from "@/lib/motion/entrances";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { CONTACTS_BADGE_DELAYS_MS } from "../../../../../../constants/onboarding";
import { CONTACTS_ART_ROWS } from "../../../../../../constants/contactsArt";

/**
 * Shows, before anything is asked, what finding friends looks like: rows
 * from an address book arrive, and the people already on HaalKhata get a
 * badge, popping in once the rows have arrived (a fade under Reduce Motion).
 * Purely illustrative, with made-up names; nothing is read yet.
 *
 * @returns The art.
 */
export function ContactsArt() {
  const reduceMotion = useReduceMotion();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.card}>
      {CONTACTS_ART_ROWS.map((contactRow, index) => (
        <Animated.View entering={riseIn(index + 1, reduceMotion)} key={contactRow.id} style={styles.row}>
          <Avatar size="sm" user={{ ...contactRow, avatarUrl: "" }} />
          <Text numberOfLines={1} style={styles.name}>{contactRow.name}</Text>
          {contactRow.onHaalKhata ? (
            <Animated.View entering={popInAfter(CONTACTS_BADGE_DELAYS_MS.at(index) ?? 0, reduceMotion)} style={styles.badge}>
              <Text style={styles.badgeText}>On HaalKhata</Text>
            </Animated.View>
          ) : null}
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { color: colors.brand700, fontSize: 11, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    width: 290,
  },
  name: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: "600" },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.md },
});

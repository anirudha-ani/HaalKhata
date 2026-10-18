/** A titled group of found people, such as "On HaalKhata" or "Already friends". */

import { StyleSheet, View } from "react-native";
import type { FoundPerson } from "@haalkhata/shared/contacts/matches";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { FoundContactRow } from "../FoundContactRow/FoundContactRow";

/**
 * Renders one group's title and rows; renders nothing for an empty group.
 *
 * @param props - Component props.
 * @returns The section, or null.
 */
export function FoundSection({
  title,
  people,
  busyIds,
  onAdd,
  onAccept,
}: {
  /** The group's heading. */
  title: string;
  /** Its people, in display order. */
  people: FoundPerson[];
  /** Rows whose action is in flight. */
  busyIds: string[];
  /** Sends one person a request. */
  onAdd: (userId: string) => void;
  /** Accepts one person's request. */
  onAccept: (userId: string) => void;
}) {
  if (people.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>{`${title} · ${people.length}`}</Text>
      <View style={styles.list}>
        {people.map((person, index) => (
          <View key={person.user.id} style={index > 0 ? styles.divided : undefined}>
            <FoundContactRow
              busy={busyIds.includes(person.user.id)}
              onAccept={() => onAccept(person.user.id)}
              onAdd={() => onAdd(person.user.id)}
              person={person}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  divided: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  list: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  section: { gap: spacing.sm },
  title: { color: colors.inkSoft, fontSize: 13, fontWeight: "600", textTransform: "uppercase" },
});

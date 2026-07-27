/** Searchable checkbox list of people — the mobile twin of the web FriendChecklist. */

import { Check } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "@/components/ui/Avatar";
import { TextField } from "@/components/ui/TextField";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { MAX_VISIBLE_PEOPLE, SCROLLING_LIST_THRESHOLD } from "./people.constants";

/**
 * Renders a search field over a checkbox list of people.
 *
 * Search and the row cap follow the same rules as the web picker, which is
 * why the matching lives in `@haalkhata/shared/search/filter` rather than
 * being written twice: someone with 300 friends must be able to find one
 * whichever app they opened, and by the same query.
 *
 * The incoming order is preserved rather than re-ranked — `listFriends`
 * already returns people you have expenses with first, then the rest
 * alphabetically.
 *
 * @param props - Component props.
 * @returns The search field and checkbox list.
 */
export function PersonChecklist({
  people,
  selectedIds,
  onToggle,
  placeholder = "Search by name, email or phone",
}: {
  /** Everyone selectable, in the order they should be offered. */
  people: User[];
  /** Ids currently checked. */
  selectedIds: string[];
  /** Called with a person's id when their row is tapped. */
  onToggle: (userId: string) => void;
  /** Placeholder text in the search field. */
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");

  const matching = useMemo(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) return people;
    return people.filter((person) => matchesTerms(terms, person.name, person.email, person.phone));
  }, [people, query]);
  const visible = matching.slice(0, MAX_VISIBLE_PEOPLE);
  const hiddenCount = matching.length - visible.length;
  const scrolls = people.length > SCROLLING_LIST_THRESHOLD;

  return (
    <View style={styles.container}>
      <TextField
        autoCapitalize="none"
        onChangeText={setQuery}
        placeholder={placeholder}
        value={query}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrolls}
        style={[styles.listCard, scrolls ? styles.listScroll : null]}
      >
        {visible.map((person, index) => {
          const isChecked = selectedIds.includes(person.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isChecked }}
              key={person.id}
              onPress={() => onToggle(person.id)}
              style={[styles.row, index > 0 ? styles.rowDivider : null]}
            >
              <View style={[styles.checkbox, isChecked ? styles.checkboxChecked : null]}>
                {isChecked ? <Check color={colors.white} size={12} /> : null}
              </View>
              <Avatar size="sm" user={person} />
              <Text numberOfLines={1} style={styles.rowName}>
                {person.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {matching.length === 0 ? (
        <Text style={styles.hint}>No one matches “{query}”.</Text>
      ) : hiddenCount > 0 ? (
        <Text style={styles.hint}>
          Showing {visible.length} of {matching.length} — keep typing to narrow it down.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 5,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  checkboxChecked: {
    backgroundColor: colors.brand600,
    borderColor: colors.brand600,
  },
  container: {
    gap: spacing.sm,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  listCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  listScroll: {
    maxHeight: 240,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  rowName: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "500",
  },
});

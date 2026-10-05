/** Searchable checkbox list of people, the mobile twin of the web FriendChecklist. */

import { Check, ChevronDown, ChevronUp } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "@/components/ui/Avatar";
import { TextField } from "@/components/ui/TextField";
import { useScrollEdges } from "@/lib/hooks/useScrollEdges";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { LIST_MAX_HEIGHT, MAX_VISIBLE_PEOPLE } from "./people.constants";

/**
 * Renders a search field over a checkbox list of people.
 *
 * Search and the row cap follow the same rules as the web picker, which is
 * why the matching lives in `@haalkhata/shared/search/filter` rather than
 * being written twice: someone with 300 friends must be able to find one
 * whichever app they opened, and by the same query.
 *
 * Order: people who can be picked come first, in the order given
 * (`listFriends` already puts people you have expenses with first, then the
 * rest alphabetically), and rows that cannot be picked sink to the bottom.
 * They stay visible so "why isn't Rifat here?" answers itself, but they must
 * not sit between the likely picks.
 *
 * The list never grows the screen. It is capped at about five rows and
 * scrolls inside, with a "scroll for more" cue at whichever edge has rows
 * beyond it.
 *
 * Search matches names only. Other people's email and phone are private
 * fields the server no longer sends in any list, so matching on them would
 * be matching on empty strings, and promising it in the placeholder would
 * be a lie.
 *
 * @param props - Component props.
 * @returns The search field and checkbox list.
 */
export function PersonChecklist({
  people,
  selectedIds,
  onToggle,
  placeholder = "Search by name",
  disabledIds,
  disabledHint = "",
}: {
  /** Everyone selectable, in the order they should be offered. */
  people: User[];
  /** Ids currently checked. */
  selectedIds: string[];
  /** Called with a person's id when their row is tapped. */
  onToggle: (userId: string) => void;
  /** Placeholder text in the search field. */
  placeholder?: string;
  /**
   * People shown but not selectable, e.g. Invited (unregistered) friends in
   * an expense picker, who cannot be on a transaction until they sign up.
   * Shown rather than hidden so "why isn't Rifat here?" never comes up, and
   * sorted after everyone who can be picked.
   */
  disabledIds?: Set<string>;
  /** Short label rendered on a disabled row saying why. */
  disabledHint?: string;
}) {
  const [query, setQuery] = useState("");
  const edges = useScrollEdges("y");

  // Pickable rows first, then the rest, each half in its given order.
  const ordered = useMemo(() => {
    if (!disabledIds || disabledIds.size === 0) return people;
    return [
      ...people.filter((person) => !disabledIds.has(person.id)),
      ...people.filter((person) => disabledIds.has(person.id)),
    ];
  }, [people, disabledIds]);

  const matching = useMemo(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) return ordered;
    return ordered.filter((person) => matchesTerms(terms, person.name));
  }, [ordered, query]);
  const visible = matching.slice(0, MAX_VISIBLE_PEOPLE);
  const hiddenCount = matching.length - visible.length;

  return (
    <View style={styles.container}>
      <TextField
        autoCapitalize="none"
        onChangeText={setQuery}
        placeholder={placeholder}
        value={query}
      />
      <View style={styles.listFrame}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          onContentSizeChange={edges.onContentSizeChange}
          onLayout={edges.onLayout}
          onScroll={edges.onScroll}
          scrollEventThrottle={edges.scrollEventThrottle}
          style={styles.list}
        >
          {visible.map((person, index) => {
            const isChecked = selectedIds.includes(person.id);
            const isDisabled = disabledIds?.has(person.id) ?? false;
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isChecked, disabled: isDisabled }}
                disabled={isDisabled}
                key={person.id}
                onPress={() => onToggle(person.id)}
                style={[
                  styles.row,
                  index > 0 ? styles.rowDivider : null,
                  isDisabled ? styles.rowDisabled : null,
                ]}
              >
                <View style={[styles.checkbox, isChecked ? styles.checkboxChecked : null]}>
                  {isChecked ? <Check color={colors.white} size={12} /> : null}
                </View>
                <Avatar size="sm" user={person} />
                <Text numberOfLines={1} style={styles.rowName}>
                  {person.name}
                </Text>
                {isDisabled && disabledHint ? (
                  <Text style={styles.rowHint}>{disabledHint}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
        {/* Edge cues, as overlays so the rows keep their height and nothing
            jumps when a cue appears or goes away. */}
        {edges.beforeStart ? (
          <View pointerEvents="none" style={[styles.edge, styles.edgeTop]}>
            <ChevronUp color={colors.inkSoft} size={14} />
          </View>
        ) : null}
        {edges.afterEnd ? (
          <View pointerEvents="none" style={[styles.edge, styles.edgeBottom]}>
            <View style={styles.cue}>
              <ChevronDown color={colors.inkSoft} size={12} />
              <Text style={styles.cueText}>Scroll for more</Text>
            </View>
          </View>
        ) : null}
      </View>
      {matching.length === 0 ? (
        <Text style={styles.hint}>No one matches “{query}”.</Text>
      ) : hiddenCount > 0 ? (
        <Text style={styles.hint}>
          Showing {visible.length} of {matching.length}. Keep typing to narrow it down.
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
  cue: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  cueText: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: "500",
  },
  edge: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    right: 0,
  },
  edgeBottom: {
    bottom: spacing.xs,
  },
  edgeTop: {
    top: spacing.xs,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  list: {
    maxHeight: LIST_MAX_HEIGHT,
  },
  listFrame: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  rowHint: {
    color: colors.inkSoft,
    fontSize: 11,
  },
  rowName: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "500",
  },
});

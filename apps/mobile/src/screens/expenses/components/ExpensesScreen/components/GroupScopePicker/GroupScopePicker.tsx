/** Group scope picker: one chip that opens a searchable sheet of the user's groups, for the expenses filter. */

import { Check, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  GROUP_SCOPE_LABEL,
  SCOPE_PICKER_SEARCH_THRESHOLD,
  scopePickerGroups,
} from "@haalkhata/shared/expense/scopeFilter";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the group half of the expenses scope filter: a chip that names the
 * picked group (or just says "Groups") and opens a sheet listing every group.
 *
 * It replaces a chip per group, which read well with three groups and buried
 * the list under rows of chips with thirty. The sheet scrolls, and grows a
 * search field once there are enough groups to need one. Picking "All" or
 * "One-off" beside it is how a group filter is cleared.
 *
 * Drawn here instead of with the shared Chip because it needs a trailing
 * chevron and a caption that truncates; a group's name can be as long as its
 * owner liked.
 *
 * @param props - Component props.
 * @returns The chip and, while open, its picker sheet.
 */
export function GroupScopePicker({
  groups,
  selectedId,
  onSelect,
}: {
  /** The user's groups, in the order to list them. */
  groups: { id: string; name: string }[];
  /** Id of the group being filtered on; anything else means no group is picked. */
  selectedId: string;
  /** Called with the id of the newly picked group. */
  onSelect: (groupId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = groups.find((group) => group.id === selectedId);
  const options = scopePickerGroups(groups, query);

  /** Closes the sheet, clearing the search so the next open starts from every group. */
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Pressable
        accessibilityLabel={selected ? `Showing ${selected.name}. Change group` : "Filter by group"}
        accessibilityRole="button"
        accessibilityState={{ selected: Boolean(selected) }}
        onPress={() => setOpen(true)}
        style={[styles.chip, selected ? styles.chipSelected : null]}
      >
        <Text numberOfLines={1} style={[styles.label, selected ? styles.labelSelected : null]}>
          {selected ? selected.name : GROUP_SCOPE_LABEL}
        </Text>
        <ChevronDown color={selected ? colors.brand700 : colors.inkSoft} size={14} />
      </Pressable>
      {open ? (
        <Sheet onClose={close} title="Filter by group">
          <View style={styles.sheetBody}>
            {groups.length > SCOPE_PICKER_SEARCH_THRESHOLD ? (
              <TextField
                autoCapitalize="none"
                autoCorrect={false}
                label="Search"
                onChangeText={setQuery}
                placeholder="Group name"
                value={query}
              />
            ) : null}
            {options.map((group) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: group.id === selectedId }}
                key={group.id}
                onPress={() => {
                  onSelect(group.id);
                  close();
                }}
                style={styles.option}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.optionName,
                    group.id === selectedId ? styles.optionNameSelected : null,
                  ]}
                >
                  {group.name}
                </Text>
                {group.id === selectedId ? <Check color={colors.brand600} size={16} /> : null}
              </Pressable>
            ))}
            {options.length === 0 ? (
              <Text style={styles.noMatches}>No group matches that.</Text>
            ) : null}
          </View>
        </Sheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Mirrors the shared Chip, so the three controls read as one row.
  chip: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: "row",
    flexShrink: 1,
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  chipSelected: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand600,
  },
  label: {
    color: colors.inkSoft,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  labelSelected: {
    color: colors.brand700,
  },
  noMatches: {
    color: colors.inkSoft,
    fontSize: 13,
    paddingVertical: spacing.md,
    textAlign: "center",
  },
  option: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  optionName: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
  },
  optionNameSelected: {
    color: colors.brand700,
    fontWeight: "600",
  },
  sheetBody: {
    gap: spacing.xs,
  },
});

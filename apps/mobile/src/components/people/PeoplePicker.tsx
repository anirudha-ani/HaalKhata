/** "Who's on this?" picker: participant chips, a searchable friend checklist, and the group choice. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronUp, UserPlus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { PersonChecklist } from "./PersonChecklist";

/** A group as this picker needs it — enough to label one chip. */
export interface PickerGroup {
  /** Group id, used as the chip value. */
  id: string;
  /** Group name shown on the chip. */
  name: string;
}

/**
 * Renders the cast of an expense: one chip per participant, a disclosure
 * over a searchable friend list for adding more, and the group choice.
 *
 * Group and ad-hoc people are alternatives, not layers — the server requires
 * every participant of a group expense to be a member of it, so picking a
 * group takes over the cast and hides the add-people control. Clearing the
 * group hands it back.
 *
 * When editing, only the scope is locked: a saved expense cannot move
 * between a group and a one-off ledger (the server pins it, because
 * settlements live in the scope), but who is on it can still change — the
 * server recomputes the splits and locks both the old and the new cast.
 *
 * The friend list is the same searchable checklist the group pickers use,
 * so someone with 300 friends can find one by typing rather than by
 * scrolling a wall of chips.
 *
 * @param props - Component props.
 * @returns The participant picker section.
 */
export function PeoplePicker({
  me: currentUser,
  people,
  friends,
  groups,
  groupId,
  friendIds,
  onGroupChange,
  onToggleFriend,
  scopeLocked = false,
}: {
  /** The signed-in user, pinned as the first chip and labelled "You". */
  me: User | undefined;
  /** The resolved cast, in display order; rendered as chips. */
  people: User[];
  /** Everyone who can be added to a one-off expense. */
  friends: User[];
  /** Groups the signed-in user belongs to. */
  groups: PickerGroup[];
  /** Currently selected group id, or "" for a one-off expense. */
  groupId: string;
  /** Ids of the ad-hoc participants (empty while a group is selected). */
  friendIds: string[];
  /** Called with the new group id ("" for none) when a group chip is tapped. */
  onGroupChange: (groupId: string) => void;
  /** Called with a friend's id to add or remove them from the ad-hoc cast. */
  onToggleFriend: (userId: string) => void;
  /** Whether the group/one-off choice is locked (a saved expense cannot change scope). */
  scopeLocked?: boolean;
}) {
  const router = useRouter();
  // Open on a blank form, where picking people is the next thing to do;
  // closed once there is a cast, so the chips are not pushed off screen.
  // Read once — reacting to `people` would make the panel jump on every
  // selection.
  const [isOpen, setIsOpen] = useState(() => people.length <= 1 && groupId === "");

  const isGroupExpense = groupId !== "";
  const selectedGroupName = groups.find((group) => group.id === groupId)?.name ?? "";

  if (groups.length === 0 && friends.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WHO&apos;S ON THIS?</Text>
        <View style={styles.card}>
          <Text style={styles.hint}>You need a friend or a group first.</Text>
          <View style={styles.hintActions}>
            <Button
              compact
              label="Friends"
              onPress={() => router.push("/friends")}
              variant="outline"
            />
            <Button
              compact
              label="Groups"
              onPress={() => router.push("/groups")}
              variant="outline"
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>WHO&apos;S ON THIS?</Text>

      <View style={styles.card}>
        <View style={styles.cast}>
          {people.map((person) => {
            const isSelf = person.id === currentUser?.id;
            // You are always on your own expense, and a group's members come
            // from the group — neither is removable here.
            const isRemovable = !isSelf && !isGroupExpense;
            return (
              <View key={person.id} style={styles.castChip}>
                <Avatar size="sm" user={person} />
                <Text numberOfLines={1} style={styles.castName}>
                  {isSelf ? "You" : person.name}
                </Text>
                {isRemovable ? (
                  <Pressable
                    accessibilityLabel={`Remove ${person.name}`}
                    hitSlop={6}
                    onPress={() => onToggleFriend(person.id)}
                    style={styles.castRemove}
                  >
                    <X color={colors.inkSoft} size={14} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>

        {isGroupExpense ? (
          <Text style={styles.hint}>
            Everyone in {selectedGroupName} is on this — leave someone out by unchecking them
            under Split.
          </Text>
        ) : friends.length === 0 ? (
          <View style={styles.hintActions}>
            <Text style={styles.hint}>Add a friend to split this with someone, or pick a group below.</Text>
            <Button
              compact
              label="Add a friend"
              onPress={() => router.push("/friends")}
              variant="outline"
            />
          </View>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              onPress={() => setIsOpen(!isOpen)}
              style={styles.addToggle}
            >
              <UserPlus color={colors.brand600} size={16} />
              <Text style={styles.addToggleText}>Add people</Text>
              {isOpen ? (
                <ChevronUp color={colors.brand600} size={16} />
              ) : (
                <ChevronDown color={colors.brand600} size={16} />
              )}
            </Pressable>

            {isOpen ? (
              <PersonChecklist
                onToggle={onToggleFriend}
                people={friends}
                selectedIds={friendIds}
              />
            ) : null}
          </>
        )}

        {groups.length > 0 ? (
          <View style={styles.groupBlock}>
            <Text style={styles.groupLabel}>
              {scopeLocked ? "Group — can't change once saved" : "…or a group instead"}
            </Text>
            <View style={styles.chips}>
              {groups.map((group) => (
                <Chip
                  disabled={scopeLocked}
                  key={group.id}
                  label={group.name}
                  // Re-tapping the selected group clears it, which is the
                  // only way back to a one-off with no extra control.
                  onPress={() => onGroupChange(groupId === group.id ? "" : group.id)}
                  selected={groupId === group.id}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  addToggle: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.xs + 2,
  },
  addToggleText: {
    color: colors.brand600,
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  cast: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  castChip: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs + 2,
    paddingLeft: 3,
    paddingRight: spacing.sm + 2,
    paddingVertical: 3,
  },
  castName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
    maxWidth: 140,
  },
  castRemove: {
    borderRadius: radii.full,
    padding: 2,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  groupBlock: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  groupLabel: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: "500",
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  hintActions: {
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
});

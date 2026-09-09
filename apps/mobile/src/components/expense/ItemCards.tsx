/** Item cards: one card per line item with people chips, a claim mode, per-item portions, and the tax and tip rows. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Check, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { formatMoney, parseMoneyInput } from "@haalkhata/shared/money/money";
import { MAX_EXPENSE_ITEM_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { isAssigned, percentOfItems } from "@/lib/expense/itemDraft";
import type { ItemDraft } from "@/lib/hooks/useItemDraft";
import { colors, radii, spacing } from "@/lib/theme/theme";
import {
  CHIP_TINT_ALPHA,
  MAX_ASSIGNEE_WEIGHT,
  MAX_ITEM_QUANTITY,
  TIP_PERCENT_PRESETS,
} from "./itemCards.constants";

/**
 * A person's name as a chip shows it: "You" for the signed-in user, otherwise
 * the first name. The full name stays in the accessibility label.
 *
 * @param person - The person to label.
 * @param meId - Id of the signed-in user.
 * @returns The short display name.
 */
function shortName(person: User, meId: string | undefined): string {
  if (person.id === meId) return "You";
  return person.name.split(/\s+/)[0] || person.name;
}

/**
 * A person's name for accessibility labels and claim-mode copy.
 *
 * @param person - The person to label.
 * @param meId - Id of the signed-in user.
 * @returns "You" for the signed-in user, otherwise the full name.
 */
function fullName(person: User, meId: string | undefined): string {
  return person.id === meId ? "You" : person.name;
}

/**
 * Renders line items as cards: name and amount on the first line, then one
 * chip per person to toggle who had it. Nothing scrolls sideways, which is
 * what an items-by-people table cannot manage on a phone.
 *
 * Two things make a long receipt fast. **Claim mode**: pick a person in the
 * bar at the top and every card becomes a tap target for them, the way a
 * table actually settles up, one person at a time; the chips stay put.
 * **Portions per card**: most lines are on/off; the rare "two chais against
 * one" opens a stepper on that card alone. The same panel holds the line's
 * quantity, shown after the name once it is above one.
 *
 * The running per-person totals live in the form's SplitSummary, which every
 * split mode shares, so the cards carry only their own notes.
 *
 * @param props - Component props.
 * @returns The cards, the add button, and the tax and tip rows; null while
 *   the draft has no lines yet.
 */
export function ItemCards({
  draft,
  people,
  meId,
  currency,
  scanned = false,
}: {
  /** The draft controller from useItemDraft. */
  draft: ItemDraft;
  /** Everyone a line can be assigned to, the viewer first. */
  people: User[];
  /** The signed-in user's id, so their chip reads "You". */
  meId: string | undefined;
  /** ISO 4217 code the amounts are shown in. */
  currency: string;
  /** Whether the draft came off a receipt photo, which changes how the quantity row is worded. */
  scanned?: boolean;
}) {
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  if (draft.items === null) return null;
  const items = draft.items;
  const claimer = people.find((person) => person.id === claimingId) ?? null;
  const taxPercent = percentOfItems(draft.taxCents, draft.itemsTotalCents);
  const tipPercent = percentOfItems(draft.tipCents, draft.itemsTotalCents);

  return (
    <View style={styles.container}>
      {people.length > 0 ? (
        <View style={styles.claimBar}>
          <View style={styles.claimLabelRow}>
            <Text style={styles.claimLabel}>
              {claimer ? (
                <>
                  Tap the items{" "}
                  <Text style={styles.claimLabelStrong}>{fullName(claimer, meId)}</Text> had
                </>
              ) : (
                "Who had what? Tap a person, then their items."
              )}
            </Text>
            <Text style={styles.claimCaption}>
              {items.length} item{items.length === 1 ? "" : "s"} · {people.length} people
            </Text>
          </View>
          <View style={styles.claimPeople}>
            {people.map((person) => {
              const active = claimingId === person.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={person.id}
                  onPress={() => setClaimingId(active ? null : person.id)}
                  style={[styles.personPill, active ? styles.personPillActive : null]}
                >
                  <Avatar size="sm" user={person} />
                  <Text style={[styles.personPillText, active ? styles.personPillTextActive : null]}>
                    {shortName(person, meId)}
                  </Text>
                </Pressable>
              );
            })}
            {claimer ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setClaimingId(null)}
                style={styles.doneButton}
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {items.map((item, index) => {
        const cents = parseMoneyInput(item.total, currency);
        const hasAmount = cents !== null && cents > 0;
        const onItem = people.filter((person) => (item.assignees[person.id] ?? 0) > 0);
        const everyoneOn = people.length > 0 && onItem.length === people.length;
        const unassigned = !isAssigned(item);
        const sumWeights = onItem.reduce(
          (runningTotal, person) => runningTotal + item.assignees[person.id],
          0,
        );
        const claimerOn = claimer ? (item.assignees[claimer.id] ?? 0) > 0 : false;
        const expanded = expandedKey === item.key;
        const note = !hasAmount ? "Needs an amount" : unassigned ? "Nobody's on this yet" : "";
        return (
          <Pressable
            accessibilityRole={claimer ? "button" : undefined}
            accessibilityState={claimer ? { selected: claimerOn } : undefined}
            disabled={!claimer}
            key={item.key}
            onPress={claimer ? () => draft.setWeight(index, claimer.id, claimerOn ? 0 : 1) : undefined}
            style={[
              styles.card,
              hasAmount && unassigned ? styles.cardUnassigned : null,
              claimer ? (claimerOn ? styles.cardClaimed : styles.cardClaimable) : null,
            ]}
          >
            {claimer && claimerOn ? (
              <View style={styles.claimBadge}>
                <Check color={colors.white} size={11} />
                <Text style={styles.claimBadgeText}>{fullName(claimer, meId)}</Text>
              </View>
            ) : null}

            <View style={styles.cardTop}>
              <View style={styles.nameWrap}>
                <TextInput
                  accessibilityLabel={`Name for item ${index + 1}${
                    item.quantity > 1 ? `, quantity ${item.quantity}` : ""
                  }`}
                  maxLength={MAX_EXPENSE_ITEM_NAME_LENGTH}
                  onChangeText={(text) => draft.updateItem(index, { name: text })}
                  placeholder="Item name"
                  placeholderTextColor={colors.inkSoft}
                  style={[styles.field, item.quantity > 1 ? styles.fieldWithQuantity : null]}
                  value={item.name}
                />
                {/* The count reads as part of the line, the way a receipt
                    prints it, never as a control. */}
                {item.quantity > 1 ? (
                  <Text pointerEvents="none" style={styles.quantitySuffix}>
                    ×{item.quantity}
                  </Text>
                ) : null}
              </View>
              <TextInput
                accessibilityLabel={`Amount for item ${index + 1}`}
                keyboardType="decimal-pad"
                onChangeText={(text) => draft.updateItem(index, { total: text })}
                placeholder="0.00"
                placeholderTextColor={colors.inkSoft}
                style={[styles.field, styles.amountField]}
                value={item.total}
              />
              <Pressable
                accessibilityLabel={`Remove item ${index + 1}`}
                hitSlop={6}
                onPress={() => draft.removeItem(index)}
                style={styles.removeButton}
              >
                <Trash2 color={colors.inkSoft} size={16} />
              </Pressable>
            </View>

            <View style={styles.chips}>
              {people.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: everyoneOn }}
                  onPress={() =>
                    draft.setAssignees(
                      index,
                      everyoneOn ? {} : Object.fromEntries(people.map((person) => [person.id, 1])),
                    )
                  }
                  style={[styles.chip, styles.everyoneChip, everyoneOn ? styles.everyoneChipOn : null]}
                >
                  <Text style={[styles.chipText, everyoneOn ? styles.everyoneChipTextOn : null]}>
                    Everyone
                  </Text>
                </Pressable>
              ) : null}
              {people.map((person) => {
                const weight = item.assignees[person.id] ?? 0;
                const isOn = weight > 0;
                // A lit chip takes the person's own avatar colour, so a fully
                // assigned card reads as four people, not four alarms, and
                // the same colour carries into the summary.
                const tint = person.avatarColor || colors.brand600;
                return (
                  <Pressable
                    accessibilityLabel={`${isOn ? "Remove" : "Add"} ${fullName(person, meId)} ${
                      isOn ? "from" : "to"
                    } item ${index + 1}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isOn }}
                    key={person.id}
                    onPress={() => draft.setWeight(index, person.id, isOn ? 0 : 1)}
                    style={[
                      styles.chip,
                      isOn ? { backgroundColor: `${tint}${CHIP_TINT_ALPHA}`, borderColor: tint } : null,
                    ]}
                  >
                    <View style={isOn ? null : styles.chipAvatarOff}>
                      <Avatar size="sm" user={person} />
                    </View>
                    <Text style={[styles.chipText, isOn ? styles.chipTextOn : null]}>
                      {shortName(person, meId)}
                    </Text>
                    {weight > 1 ? <Text style={styles.chipPortions}>{weight} portions</Text> : null}
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setExpandedKey(expanded ? null : item.key)}
                style={[styles.chip, styles.portionsToggle, expanded ? styles.portionsToggleOpen : null]}
              >
                <Text style={[styles.chipText, expanded ? styles.portionsToggleTextOpen : null]}>
                  Portions
                </Text>
              </Pressable>
            </View>

            {expanded ? (
              <View style={styles.portionsPanel}>
                <View style={[styles.portionRow, styles.quantityRow]}>
                  <Text style={styles.portionName}>
                    {scanned ? "Quantity on the receipt" : "Quantity"}
                  </Text>
                  <Stepper
                    label={scanned ? "on the receipt" : "of this item"}
                    max={MAX_ITEM_QUANTITY}
                    min={1}
                    onChange={(next) => draft.updateItem(index, { quantity: next })}
                    value={item.quantity}
                  />
                </View>
                <Text style={styles.portionsHint}>
                  {onItem.length > 0
                    ? "How many portions each person had of this line"
                    : "Add people with the chips above to split portions"}
                </Text>
                {onItem.map((person) => {
                  const weight = item.assignees[person.id];
                  const each =
                    cents !== null && sumWeights > 0
                      ? formatMoney(Math.round((cents * weight) / sumWeights), currency)
                      : "";
                  return (
                    <View key={person.id} style={styles.portionRow}>
                      <Avatar size="sm" user={person} />
                      <Text numberOfLines={1} style={styles.portionName}>
                        {fullName(person, meId)}
                      </Text>
                      <Stepper
                        label={`for ${fullName(person, meId)}`}
                        max={MAX_ASSIGNEE_WEIGHT}
                        min={0}
                        onChange={(next) => draft.setWeight(index, person.id, next)}
                        value={weight}
                      />
                      <Text style={styles.portionEach}>{each}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {note ? <Text style={styles.note}>{note}</Text> : null}
          </Pressable>
        );
      })}

      <Pressable accessibilityRole="button" onPress={draft.addItem} style={styles.addItem}>
        <Plus color={colors.inkSoft} size={16} />
        <Text style={styles.addItemText}>Add item</Text>
      </Pressable>

      <View style={styles.addons}>
        <View style={styles.addonRow}>
          <Text style={styles.addonLabel}>Tax</Text>
          <TextInput
            accessibilityLabel="Tax"
            keyboardType="decimal-pad"
            onChangeText={draft.setTax}
            placeholder="0.00"
            placeholderTextColor={colors.inkSoft}
            style={[styles.field, styles.addonField]}
            value={draft.tax}
          />
          <Text style={styles.addonHint}>
            {taxPercent ? <Text style={styles.addonRate}>{taxPercent} of items </Text> : null}
            split in proportion to each person&apos;s items
          </Text>
        </View>
        <View style={styles.addonRow}>
          <Text style={styles.addonLabel}>Tip</Text>
          <TextInput
            accessibilityLabel="Tip"
            keyboardType="decimal-pad"
            onChangeText={draft.setTip}
            placeholder="0.00"
            placeholderTextColor={colors.inkSoft}
            style={[styles.field, styles.addonField]}
            value={draft.tip}
          />
          <View style={styles.presets}>
            {TIP_PERCENT_PRESETS.map((percent) => (
              <Pressable
                accessibilityRole="button"
                key={percent}
                onPress={() => draft.applyTipPercent(percent)}
                style={styles.preset}
              >
                <Text style={styles.presetText}>{percent}%</Text>
              </Pressable>
            ))}
            {tipPercent ? <Text style={styles.addonRate}>{tipPercent} of items</Text> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * A minus / count / plus control for small integers.
 *
 * @param props - Component props.
 * @returns The stepper.
 */
function Stepper({
  value,
  min,
  max,
  label,
  onChange,
}: {
  /** The current count. */
  value: number;
  /** Lowest count the minus button may reach. */
  min: number;
  /** Highest count the plus button may reach. */
  max: number;
  /** Suffix for the buttons' accessibility labels, e.g. "for Adnan". */
  label: string;
  /** Called with the new count. */
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityLabel={`One fewer ${label}`}
        accessibilityRole="button"
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        style={[styles.stepButton, value <= min ? styles.stepButtonDisabled : null]}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        accessibilityLabel={`One more ${label}`}
        accessibilityRole="button"
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
        style={[styles.stepButton, value >= max ? styles.stepButtonDisabled : null]}
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  addItem: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "dashed",
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs + 2,
    height: 44,
    justifyContent: "center",
  },
  addItemText: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: "600",
  },
  addonField: {
    width: 92,
  },
  addonHint: {
    color: colors.inkSoft,
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  addonLabel: {
    color: colors.inkSoft,
    fontSize: 14,
    width: 36,
  },
  addonRate: {
    color: colors.ink,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  addonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm + 2,
  },
  addons: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  amountField: {
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    width: 92,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm + 2,
    padding: spacing.md,
  },
  cardClaimable: {
    borderStyle: "dashed",
  },
  cardClaimed: {
    borderColor: colors.brand500,
    shadowColor: colors.brand500,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  cardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  cardUnassigned: {
    backgroundColor: colors.neg50,
    borderColor: "#f0dcc0",
  },
  chip: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    height: 34,
    paddingLeft: 3,
    paddingRight: spacing.sm + 2,
  },
  chipAvatarOff: {
    opacity: 0.55,
  },
  chipPortions: {
    color: colors.brand700,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  chipText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextOn: {
    color: colors.ink,
    fontWeight: "600",
  },
  chips: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  claimBadge: {
    alignItems: "center",
    backgroundColor: colors.brand600,
    borderRadius: radii.full,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    position: "absolute",
    right: spacing.md,
    top: -10,
    zIndex: 1,
  },
  claimBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  claimBar: {
    gap: spacing.sm,
  },
  claimCaption: {
    color: colors.inkSoft,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  claimLabel: {
    color: colors.inkSoft,
    flex: 1,
    fontSize: 12,
  },
  claimLabelRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  claimLabelStrong: {
    color: colors.brand700,
    fontWeight: "600",
  },
  claimPeople: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  container: {
    gap: spacing.md,
  },
  doneButton: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    marginLeft: "auto",
    paddingHorizontal: spacing.md,
  },
  doneText: {
    color: colors.brand700,
    fontSize: 13,
    fontWeight: "600",
  },
  everyoneChip: {
    paddingLeft: spacing.sm + 2,
  },
  everyoneChipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  everyoneChipTextOn: {
    color: colors.card,
    fontWeight: "600",
  },
  field: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md - 2,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    height: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
  },
  fieldWithQuantity: {
    paddingRight: 46,
  },
  nameWrap: {
    flex: 1,
    minWidth: 0,
  },
  note: {
    color: colors.neg700,
    fontSize: 12,
    fontWeight: "600",
  },
  personPill: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    height: 36,
    paddingLeft: 3,
    paddingRight: spacing.md,
  },
  personPillActive: {
    backgroundColor: colors.brand600,
    borderColor: colors.brand600,
  },
  personPillText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  personPillTextActive: {
    color: colors.white,
  },
  portionEach: {
    color: colors.inkSoft,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    width: 64,
  },
  portionName: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  portionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  portionsHint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  portionsPanel: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm + 2,
  },
  portionsToggle: {
    borderStyle: "dashed",
    marginLeft: "auto",
    paddingLeft: spacing.sm + 2,
  },
  portionsToggleOpen: {
    borderColor: colors.brand200,
    borderStyle: "solid",
  },
  portionsToggleTextOpen: {
    color: colors.brand700,
  },
  preset: {
    borderColor: colors.line,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm + 1,
    paddingVertical: 4,
  },
  presetText: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  presets: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  quantityRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    paddingBottom: spacing.sm,
  },
  quantitySuffix: {
    color: colors.inkSoft,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    position: "absolute",
    right: spacing.md,
    top: 12,
  },
  removeButton: {
    padding: spacing.sm,
  },
  stepButton: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 32,
  },
  stepButtonDisabled: {
    opacity: 0.4,
  },
  stepText: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 18,
  },
  stepValue: {
    color: colors.ink,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    minWidth: 28,
    textAlign: "center",
  },
  stepper: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
});

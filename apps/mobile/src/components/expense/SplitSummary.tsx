/** Who-owes-what for an expense split: a strip that opens in place on phones, a panel with bars on wide layouts. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { formatMoney } from "@haalkhata/shared/money/money";
import { useScrollEdges } from "@/lib/hooks/useScrollEdges";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders what each person owes under the current split, the expense total,
 * and whatever still stops it adding up. Two layouts of one set of numbers.
 *
 * The `panel` sits beside the form on wide layouts, with room for names and
 * a bar per person showing their slice of the total. The `strip` sits under
 * the Split section on a phone: collapsed, it shows one pill per person in a
 * row that scrolls sideways, with a chevron at any edge that has more behind
 * it, since an unscrolled row with a hard edge looks complete; tapping the
 * total opens the strip in place into the same detail the panel shows. Any
 * split mode feeds it; an itemized one adds the items, tax and tip breakdown.
 *
 * @param props - Component props.
 * @returns The summary in the requested layout.
 */
export function SplitSummary({
  layout,
  people,
  meId,
  currency,
  shares,
  totalCents,
  breakdown,
  warnings,
  ready,
  readyMessage,
}: {
  /** `strip` for the phone strip, `panel` for the wide-layout column. */
  layout: "strip" | "panel";
  /** Everyone on the expense, in display order. */
  people: User[];
  /** Id of the signed-in user, shown as "You". */
  meId: string | undefined;
  /** ISO 4217 code used to format money. */
  currency: string;
  /** What each person currently owes, keyed by user id, in cents. */
  shares: Record<string, number>;
  /** The expense total, in cents. */
  totalCents: number;
  /** Itemized only: the subtotal, tax and tip that make up the total. */
  breakdown?: { itemsTotalCents: number; taxCents: number; tipCents: number };
  /** Sentences about what still stops the split adding up; empty when it does. */
  warnings: string[];
  /** Whether there is enough of a draft to reassure about; a blank form has nothing to say. */
  ready: boolean;
  /** What to say when there are no warnings and the draft is ready, e.g. "Everything is assigned". */
  readyMessage: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const edges = useScrollEdges("x");
  const label = (person: User) => (person.id === meId ? "You" : person.name);

  const status =
    warnings.length > 0 ? (
      <View style={styles.warnings}>
        {warnings.map((warning) => (
          <View key={warning} style={styles.warning}>
            <Text style={styles.warningText}>{warning}</Text>
          </View>
        ))}
      </View>
    ) : ready ? (
      <Text style={styles.ready}>{readyMessage}</Text>
    ) : null;

  const details = (
    <View style={styles.details}>
      {people.map((person) => {
        const share = shares[person.id] ?? 0;
        const width = totalCents > 0 ? Math.round((share / totalCents) * 100) : 0;
        return (
          <View key={person.id} style={styles.personBlock}>
            <View style={styles.personRow}>
              <Avatar size="sm" user={person} />
              <Text numberOfLines={1} style={styles.personName}>
                {label(person)}
              </Text>
              <Text style={styles.personAmount}>{formatMoney(share, currency)}</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { backgroundColor: person.avatarColor || colors.brand600, width: `${width}%` }]} />
            </View>
          </View>
        );
      })}
      {breakdown ? (
        <View style={styles.breakdown}>
          {[
            ["Items", breakdown.itemsTotalCents],
            ["Tax", breakdown.taxCents],
            ["Tip", breakdown.tipCents],
          ].map(([name, cents]) => (
            <View key={String(name)} style={styles.breakdownRow}>
              <Text style={styles.breakdownText}>{name}</Text>
              <Text style={styles.breakdownText}>{formatMoney(Number(cents), currency)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {status}
    </View>
  );

  if (layout === "panel") {
    return (
      <View accessibilityLabel="Who owes what" style={styles.panel}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.panelTotal}>{formatMoney(totalCents, currency)}</Text>
        {details}
      </View>
    );
  }

  return (
    <View style={styles.strip}>
      <View style={styles.stripHeader}>
        <View style={styles.pillsFrame}>
          <ScrollView
            contentContainerStyle={styles.pills}
            horizontal
            onContentSizeChange={edges.onContentSizeChange}
            onLayout={edges.onLayout}
            onScroll={edges.onScroll}
            scrollEventThrottle={edges.scrollEventThrottle}
            showsHorizontalScrollIndicator={false}
          >
            {people.map((person) => (
              <View key={person.id} style={styles.pill}>
                <Avatar size="sm" user={person} />
                <Text style={styles.pillText}>{formatMoney(shares[person.id] ?? 0, currency)}</Text>
              </View>
            ))}
          </ScrollView>
          {/* Edge cues: a chevron wherever more pills wait. */}
          {edges.beforeStart ? (
            <View pointerEvents="none" style={[styles.edge, styles.edgeStart]}>
              <ChevronLeft color={colors.inkSoft} size={16} />
            </View>
          ) : null}
          {edges.afterEnd ? (
            <View pointerEvents="none" style={[styles.edge, styles.edgeEnd]}>
              <ChevronRight color={colors.inkSoft} size={16} />
            </View>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel={expanded ? "Hide who owes what" : "Show who owes what"}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={styles.totalButton}
        >
          <View>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.stripTotal}>{formatMoney(totalCents, currency)}</Text>
          </View>
          {expanded ? (
            <ChevronDown color={colors.inkSoft} size={20} />
          ) : (
            <ChevronUp color={colors.inkSoft} size={20} />
          )}
        </Pressable>
      </View>
      {expanded ? (
        <View style={styles.stripDetails}>{details}</View>
      ) : status ? (
        <View style={styles.stripStatus}>{status}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: radii.full,
    height: "100%",
  },
  barTrack: {
    backgroundColor: colors.paper,
    borderRadius: radii.full,
    height: 4,
    marginLeft: 28 + spacing.sm + 2,
    overflow: "hidden",
  },
  breakdown: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: 6,
    paddingTop: spacing.md,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  breakdownText: {
    color: colors.inkSoft,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  details: {
    gap: spacing.md,
  },
  edge: {
    alignItems: "center",
    backgroundColor: colors.card,
    bottom: 0,
    justifyContent: "center",
    position: "absolute",
    top: 0,
    width: 24,
  },
  edgeEnd: {
    right: 0,
  },
  edgeStart: {
    left: 0,
  },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xl - 4,
  },
  panelTotal: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 30,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    marginTop: -spacing.sm,
  },
  personAmount: {
    color: colors.ink,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  personBlock: {
    gap: 6,
  },
  personName: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  personRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm + 2,
  },
  pill: {
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
  pillText: {
    color: colors.ink,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  pills: {
    flexDirection: "row",
    gap: 6,
  },
  pillsFrame: {
    flex: 1,
    minWidth: 0,
  },
  ready: {
    color: colors.pos700,
    fontSize: 12,
    fontWeight: "600",
  },
  strip: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 3,
    shadowColor: colors.ink,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  stripDetails: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    padding: spacing.md,
  },
  stripHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  stripStatus: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  stripTotal: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  totalButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingLeft: spacing.sm,
  },
  totalLabel: {
    color: colors.inkSoft,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
  },
  warning: {
    backgroundColor: colors.neg50,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  warningText: {
    color: colors.neg700,
    fontSize: 12,
    fontWeight: "600",
  },
  warnings: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
});

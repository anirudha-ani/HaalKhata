/** Group balances view: net positions plus pairwise/simplified debts with settle actions, per currency. */

import type { Debt, NetBalance, User } from "@haalkhata/protogen/common/v1/common_pb";
import type { GroupCurrencySection } from "@haalkhata/shared/group/currencyBalances";
import { ArrowRight, Wand2 } from "lucide-react-native";
import { StyleSheet, Switch, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { PersonLink } from "@/components/people/PersonLink";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the balances tab of a group: every member's net position, then the
 * list of who-owes-whom debts (pairwise or simplified) with an action on every
 * debt the viewer is part of: settle what they owe, record what they are owed.
 *
 * A group's money is in its own currency, but one can still hold a payment
 * recorded in another before group payments were kept to the group's own.
 * That is a second set of balances, shown after the first under headings
 * naming the currency, and settled in that currency — never netted against
 * the group's own.
 *
 * @returns The balance sections, or null until balances have loaded.
 */
export function BalancesPanel({
  sections,
  error = "",
  onRetry,
  meId,
  userById,
  simplified,
  simplifyPending = false,
  simplifyError = "",
  onToggleSimplified,
  onSettle,
}: {
  /** The group's balances per currency, its own first; nothing renders until they load. */
  sections: readonly GroupCurrencySection<NetBalance, Debt>[] | undefined;
  /** A failed balance read, displayed beside its retry control. */
  error?: string;
  /** Reloads the group balances after a failed read. */
  onRetry: () => void;
  /** The signed-in user's id, used to label rows as "You" and show settle buttons. */
  meId: string | undefined;
  /** Lookup from user id to User for rendering names and avatars. */
  userById: Map<string, User>;
  /** The group's persisted simplify-debts mode; decides which debt list is live. */
  simplified: boolean;
  /** True while a toggle of the mode is in flight; ignores taps meanwhile. */
  simplifyPending?: boolean;
  /** Why the last flip of the mode did not take; "" when it did. */
  simplifyError?: string;
  /** Called with the desired state when the simplify-debts toggle is pressed. */
  onToggleSimplified: (value: boolean) => void;
  /**
   * Called when the viewer taps the action on a debt, with the other party,
   * the amount, whether this records money *received* rather than paid, and
   * the currency the debt is in.
   */
  onSettle: (user: User, cents: number, received: boolean, currency: string) => void;
}) {
  if (error) return (
    <View style={styles.section}>
      <Text accessibilityRole="alert" style={styles.allSettledText}>{error}</Text>
      <Button label="Try again" onPress={onRetry} variant="outline" />
    </View>
  );
  if (!sections) return null;
  const several = sections.length > 1;
  /**
   * A heading, naming the currency once the group holds more than one.
   *
   * @param title - The heading's words.
   * @param currency - The section's currency.
   * @returns The heading text.
   */
  const titled = (title: string, currency: string) => (several ? `${title} · ${currency}` : title);

  return (
    <View style={styles.container}>
      {several ? (
        <View style={styles.allSettled}>
          <Text style={styles.allSettledText}>
            This group still holds money in{" "}
            {sections.slice(1).map((section) => section.currency).join(", ")} from a payment
            recorded before group payments were kept to {sections[0].currency}. Each currency is
            settled on its own.
          </Text>
        </View>
      ) : null}
      {sections.map((section) => (
        <View key={`nets-${section.currency}`} style={styles.section}>
          <Text style={styles.sectionTitle}>{titled("NET POSITIONS", section.currency)}</Text>
          <View style={styles.listCard}>
            {section.nets.map((netPosition, index) => {
              const user = userById.get(netPosition.userId);
              if (!user) return null;
              return (
                <View
                  key={netPosition.userId}
                  style={[styles.row, index > 0 ? styles.rowDivider : null]}
                >
                  <PersonLink meId={meId} style={styles.rowPerson} userId={user.id}>
                    <Avatar size="sm" user={user} />
                    <Text numberOfLines={1} style={styles.rowName}>
                      {user.id === meId ? "You" : user.name}
                    </Text>
                  </PersonLink>
                  {netPosition.netCents === 0 ? (
                    <Text style={styles.rowHint}>settled up</Text>
                  ) : (
                    <>
                      <Text style={styles.rowHint}>
                        {netPosition.netCents > 0 ? "gets back" : "owes"}
                      </Text>
                      <Money
                        cents={netPosition.netCents}
                        currency={section.currency}
                        signed
                        style={styles.rowAmount}
                      />
                    </>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}

      <View style={styles.section}>
        {/* The mode gets a real switch with its state written out, not a
            chip that reads as "maybe on?". It decides which debts exist —
            here, on friend pages, on the dashboard — and which payments the
            server accepts, for everyone in the group, so its state has to be
            legible at a glance and said before it is flipped, not after. */}
        <View style={[styles.modeCard, simplified ? styles.modeCardOn : null]}>
          <Wand2 color={simplified ? colors.brand600 : colors.inkSoft} size={18} />
          <View style={styles.modeText}>
            <View style={styles.modeTitleRow}>
              <Text style={styles.modeTitle}>Simplify debts</Text>
              <Text style={[styles.modeState, simplified ? styles.modeStateOn : null]}>
                {simplified ? "ON" : "OFF"}
              </Text>
            </View>
            <Text style={styles.modeHint}>
              {simplified
                ? "Debts are combined into the fewest payments. Applies to everyone in this group."
                : "Debts run person to person, exactly as shared. Turning this on combines them — for everyone in this group."}
            </Text>
            {/* A switch that silently stays where it was looks broken, or
                worse, looks like it worked. */}
            {simplifyError ? (
              <Text accessibilityRole="alert" style={styles.modeError}>
                Couldn&apos;t change this: {simplifyError}
              </Text>
            ) : null}
          </View>
          <Switch
            accessibilityLabel="Simplify debts"
            disabled={simplifyPending}
            onValueChange={onToggleSimplified}
            thumbColor="#ffffff"
            trackColor={{ false: colors.line, true: colors.brand600 }}
            value={simplified}
          />
        </View>

        {sections.map((section) => {
          const debts = simplified ? section.simplified : section.debts;
          // Pairwise debts that survive while every net is zero can only be a
          // loop — typically left behind by payments recorded while debts were
          // simplified. Money-wise nobody owes anybody; without a word of
          // explanation the list looks like outstanding debt, so it gets one.
          const cancelingLoop =
            !simplified &&
            debts.length > 0 &&
            section.nets.every((position) => position.netCents === 0);
          return (
            <View key={`debts-${section.currency}`} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {titled(simplified ? "SIMPLIFIED PAYMENTS" : "WHO OWES WHOM", section.currency)}
              </Text>

              {cancelingLoop ? (
                <View style={styles.allSettled}>
                  <Text style={styles.allSettledText}>
                    These debts cancel out around a loop — everyone&apos;s overall position is zero.
                    Turn Simplify debts on above to clear the view.
                  </Text>
                </View>
              ) : null}

              {debts.length === 0 ? (
                <View style={styles.allSettled}>
                  <Text style={styles.allSettledText}>
                    {several ? `Everyone is settled up in ${section.currency}` : "Everyone is settled up 🎉"}
                  </Text>
                </View>
              ) : (
                <View style={styles.debts}>
                  {debts.map((debt) => {
                    const fromUser = userById.get(debt.fromUserId);
                    const toUser = userById.get(debt.toUserId);
                    if (!fromUser || !toUser) return null;
                    const mine = debt.fromUserId === meId;
                    const owedToMe = debt.toUserId === meId;
                    return (
                      <View key={`${debt.fromUserId}-${debt.toUserId}`} style={styles.debtRow}>
                        <PersonLink meId={meId} userId={debt.fromUserId}>
                          <Avatar size="sm" user={fromUser} />
                        </PersonLink>
                        <ArrowRight color={colors.inkSoft} size={16} />
                        <PersonLink meId={meId} userId={debt.toUserId}>
                          <Avatar size="sm" user={toUser} />
                        </PersonLink>
                        <Text numberOfLines={1} style={styles.debtText}>
                          <Text style={styles.debtName}>{mine ? "You" : fromUser.name}</Text>
                          <Text style={styles.debtVerb}> owe{mine ? "" : "s"} </Text>
                          <Text style={styles.debtName}>
                            {debt.toUserId === meId ? "you" : toUser.name}
                          </Text>
                        </Text>
                        <Money cents={debt.amountCents} currency={section.currency} style={styles.rowAmount} />
                        {/* Both directions, matching the friend screen: a debt
                            you owe is one to pay, a debt owed to you is one to
                            record when it lands. Only offering the first left
                            a group where everyone owes the payer with no
                            action anywhere on the screen — the ordinary case
                            for whoever picked up the bill. */}
                        {/* A loop that nets to zero offers no action: the
                            server refuses to pay it down, and a button that
                            only ever produces a refusal is worse than none. */}
                        {(mine || owedToMe) && !cancelingLoop ? (
                          <Button
                            compact
                            label={mine ? "Settle" : "Record"}
                            onPress={() =>
                              onSettle(mine ? toUser : fromUser, debt.amountCents, !mine, section.currency)
                            }
                            variant="positive"
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  allSettled: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "dashed",
    borderWidth: 1,
    padding: spacing.xl,
  },
  allSettledText: {
    color: colors.inkSoft,
    fontSize: 14,
    textAlign: "center",
  },
  container: {
    gap: spacing.xl,
  },
  debtName: {
    fontWeight: "500",
  },
  debtRow: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  debts: {
    gap: spacing.sm,
  },
  debtText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
  },
  debtVerb: {
    color: colors.inkSoft,
  },
  listCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  modeCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  modeCardOn: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
  },
  modeError: {
    color: colors.brand600,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  modeHint: {
    color: colors.inkSoft,
    fontSize: 12,
    marginTop: 2,
  },
  modeState: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  modeStateOn: {
    color: colors.brand700,
  },
  modeText: {
    flex: 1,
    minWidth: 0,
  },
  modeTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  modeTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: "600",
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  rowHint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  rowName: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  rowPerson: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    minWidth: 0,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
});

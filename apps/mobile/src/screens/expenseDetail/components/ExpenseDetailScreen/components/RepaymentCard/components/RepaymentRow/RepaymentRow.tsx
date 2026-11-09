/** One person the reader owes on a bill: what is left to pay them, and the button that pays it back. */

import { useRouter } from "expo-router";
import { Check, HandCoins, Lock } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { RepaymentView } from "@haalkhata/shared/expense/repayment";
import { PersonLink } from "@/components/people/PersonLink";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders one repayment in its state:
 *
 * - due: who is owed and how much, then a full-width button that opens the
 *   pay-back sheet, labelled with the amount it pays;
 * - paid: a tick on the person's avatar and what was paid for the bill;
 * - square: nothing to pay, and why, with no button;
 * - blocked: what is owed, and in place of the button the reason a payment
 *   would be refused, with the group's screen one tap away when there is one.
 *
 * @param props - Component props.
 * @returns The row.
 */
export function RepaymentRow({
  view,
  person,
  meId,
  currency,
  groupId,
  onPay,
}: {
  /** The repayment, worded. */
  view: RepaymentView;
  /** Who is owed. */
  person: User;
  /** The reader's id, for the person link. */
  meId: string;
  /** The bill's currency. */
  currency: string;
  /** The group to offer beside a refusal; "" for none. */
  groupId: string;
  /** Opens the pay-back sheet for this person. */
  onPay: () => void;
}) {
  const router = useRouter();
  const done = view.state === "paid" || view.state === "square";
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <PersonLink meId={meId} userId={person.id}>
          <Avatar user={person} />
          {view.state === "paid" ? (
            <View style={styles.tick}>
              <Check color={colors.white} size={12} />
            </View>
          ) : null}
        </PersonLink>
        <View style={styles.words}>
          <Text numberOfLines={1} style={[styles.title, view.state === "paid" ? styles.titlePaid : null]}>
            {view.title}
          </Text>
          {view.state === "blocked" ? null : <Text style={styles.detail}>{view.detail}</Text>}
        </View>
        {view.state === "square" ? null : (
          <Money
            cents={view.amountCents}
            currency={currency}
            style={done ? styles.amountDone : styles.amountDue}
          />
        )}
      </View>
      {view.state === "due" ? (
        <Button
          icon={<HandCoins color={colors.white} size={16} />}
          label={view.action}
          onPress={onPay}
          variant="positive"
        />
      ) : null}
      {view.state === "blocked" ? (
        <View style={styles.refusal}>
          <Lock color={colors.inkSoft} size={16} />
          <View style={styles.refusalWords}>
            <Text style={styles.refusalText}>{view.detail}</Text>
            {groupId ? (
              <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push(`/groups/${groupId}`)}>
                <Text style={styles.groupLink}>Open group</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  amountDone: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: "700",
  },
  amountDue: {
    color: colors.neg600,
    fontSize: 18,
    fontWeight: "700",
  },
  detail: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  groupLink: {
    color: colors.brand600,
    fontSize: 14,
    fontWeight: "600",
  },
  head: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  refusal: {
    alignItems: "flex-start",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  refusalText: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  refusalWords: {
    flex: 1,
    gap: spacing.xs,
  },
  row: {
    gap: spacing.md,
  },
  tick: {
    alignItems: "center",
    backgroundColor: colors.pos600,
    borderColor: colors.card,
    borderRadius: radii.full,
    borderWidth: 2,
    bottom: -4,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: -4,
    width: 20,
  },
  title: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  titlePaid: {
    color: colors.pos700,
  },
  words: {
    flex: 1,
    minWidth: 0,
  },
});

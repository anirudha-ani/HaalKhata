/** Home prompt shown when people owe you in a currency you have no payment method for. */

import type { CounterpartyBalance } from "@haalkhata/protogen/common/v1/common_pb";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { PaymentMethodSheet } from "@/components/payment/PaymentMethodSheet";
import { formatMoney } from "@haalkhata/shared/money/money";
import { methodCapLine } from "@haalkhata/shared/payment/copy";
import { MAX_PAYMENT_METHODS_PER_USER } from "@haalkhata/shared/payment/payment.constants";
import { owedLine } from "@haalkhata/shared/payment/payPrompt";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { usePayMethodPrompt } from "./hooks/usePayMethodPrompt";

/**
 * Renders a prompt to add a payment method at the moment one is missed:
 * somebody owes the person, and nothing the person has set up works in that
 * currency, so the settle sheet would show the payer nowhere to send it.
 *
 * It says who owes and how much, names one currency, and opens the add
 * sheet already in that currency. Adding the method makes it go away, or
 * move on to the next currency with the same gap. "Not now" hides it until
 * the next launch.
 *
 * Someone whose list is already full is told so, with a way to Account,
 * where one can be removed: the form would only be refused. And a sheet
 * opened from here outlives the prompt being hidden, so a failed refresh of
 * the balances behind it does not take what was typed with it.
 *
 * @param props - Component props.
 * @returns The prompt, the add sheet while it is open, or nothing.
 */
export function PayMethodPrompt({
  counterparties,
  currencyOrder,
  defaultCurrency,
  hidden,
}: {
  /** Everyone the person has a balance with. */
  counterparties: readonly CounterpartyBalance[];
  /** Currencies in the order the screen lists them, the person's default first. */
  currencyOrder: readonly string[];
  /** The person's default currency. */
  defaultCurrency: string;
  /** True while the balances behind the prompt could not be refreshed; the prompt waits, an open sheet stays. */
  hidden: boolean;
}) {
  const router = useRouter();
  const view = usePayMethodPrompt({ counterparties, currencyOrder, defaultCurrency });
  const { prompt } = view;

  return (
    <>
      {prompt && !hidden ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            <Text style={styles.bannerLead}>Tell people how to pay you. </Text>
            {owedLine(prompt.names, formatMoney(prompt.cents, prompt.currency))}, and you have not
            added a way to be paid in {prompt.currency}.
          </Text>
          {view.atCap ? (
            <Text style={styles.capText}>
              {methodCapLine(MAX_PAYMENT_METHODS_PER_USER, prompt.currency)}
            </Text>
          ) : null}
          <View style={styles.bannerActions}>
            {view.atCap ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/account")}
                style={styles.addButton}
              >
                <Text style={styles.addButtonText}>Open Account</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={view.openAdd} style={styles.addButton}>
                <Text style={styles.addButtonText}>Add a payment method</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={view.dismiss} style={styles.dismiss}>
              <Text style={styles.dismissText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {view.addingFor ? (
        <PaymentMethodSheet
          defaultCurrency={defaultCurrency}
          forCurrency={view.addingFor}
          methods={view.methods}
          onClose={view.closeAdd}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  addButton: {
    backgroundColor: colors.pos600,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
  banner: {
    backgroundColor: colors.pos50,
    borderColor: colors.pos600,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    padding: spacing.md,
  },
  bannerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  bannerLead: {
    fontWeight: "700",
  },
  bannerText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  capText: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  dismiss: {
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  dismissText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: "500",
  },
});

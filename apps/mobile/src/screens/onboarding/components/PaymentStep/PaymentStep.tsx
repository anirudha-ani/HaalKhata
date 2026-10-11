/** Last step of the first-run flow: an optional chance to say how you want to be paid. */

import { StyleSheet, Text, View } from "react-native";
import { PaymentMethodsSection } from "@/components/payment/PaymentMethodsSection";
import { Button } from "@/components/ui/Button";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * Renders the payment step of onboarding: the same "Get paid" list the
 * account screen has, and one button that opens the ledger.
 *
 * There is no separate "skip". Adding a method is optional and the heading
 * says so, so the one button means the same thing with or without one, and
 * nobody has to work out which of two buttons loses what they just typed.
 *
 * @param props - Component props.
 * @returns The step.
 */
export function PaymentStep({
  defaultCurrency,
  error,
  pending,
  onFinish,
}: {
  /** The currency picked on the previous step, which a new method starts on. */
  defaultCurrency: string;
  /** Why leaving onboarding failed; empty when it has not. */
  error: string;
  /** Whether leaving onboarding is in flight. */
  pending: boolean;
  /** Called to mark onboarding done and open the ledger. */
  onFinish: () => void;
}) {
  return (
    <View style={styles.step}>
      <PaymentMethodsSection defaultCurrency={defaultCurrency} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button busy={pending} label="Open your ledger" onPress={onFinish} />
      <Text style={styles.hint}>You can add or change these any time in Account.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.brand600,
    fontSize: 14,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  step: {
    gap: spacing.lg,
  },
});

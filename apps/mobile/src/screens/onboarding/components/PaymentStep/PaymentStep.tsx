/** Last step of the first-run flow: an optional chance to say how you want to be paid. */

import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { usePaymentMethodsAPI } from "@/components/payment/hooks/usePaymentMethodsAPI";
import { PaymentMethodsSection } from "@/components/payment/PaymentMethodsSection";
import { Button } from "@/components/ui/Button";
import { finishOnboardingLabel } from "@haalkhata/shared/payment/copy";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * Renders the payment step of onboarding: the same "Get paid" list the
 * account screen has, and one button that leaves onboarding.
 *
 * One button, whose label follows the state of the list. With nothing added
 * it reads "Skip and open your HaalKhata", because leaving then is skipping
 * and the button should say so. Once a method exists it reads "Open your
 * HaalKhata". It is still a single button, so nobody has to work out which
 * of two loses what they just typed.
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
  // The same cached list the section above renders, so the label changes in
  // the same moment a method appears in it.
  const { methodsQuery } = usePaymentMethodsAPI();
  const hasMethods = (methodsQuery.data?.methods.length ?? 0) > 0;

  return (
    <View style={styles.step}>
      <PaymentMethodsSection defaultCurrency={defaultCurrency} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button busy={pending} label={finishOnboardingLabel(hasMethods)} onPress={onFinish} />
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

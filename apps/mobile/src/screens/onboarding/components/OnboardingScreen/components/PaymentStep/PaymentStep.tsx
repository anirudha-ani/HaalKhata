/** The last account step: an optional chance to say how you want to be paid. */

import { Wallet } from "lucide-react-native";
import { StyleSheet } from "react-native";
import { usePaymentMethodsAPI } from "@/components/payment/hooks/usePaymentMethodsAPI";
import { PaymentMethodsSection } from "@/components/payment/PaymentMethodsSection";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors } from "@/lib/theme/theme";
import { PAYMENT_STEP } from "../../../../constants/onboardingCopy";
import { StepArt } from "../StepArt/StepArt";
import { StepLayout } from "../StepLayout/StepLayout";

/**
 * Renders the same "Get paid" list the Account screen has, and one button
 * that finishes the account part of setup. Its label follows the list: with
 * nothing added it says "Skip for now", because leaving then is skipping;
 * once a method exists it says "Continue". One button, so nobody has to work
 * out which of two loses what they just typed.
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
  /** The currency picked earlier, which a new method starts on. */
  defaultCurrency: string;
  /** Why finishing the account setup failed; empty when it has not. */
  error: string;
  /** Whether finishing is in flight. */
  pending: boolean;
  /** Finishes the account setup, with whether a method was added. */
  onFinish: (hasMethods: boolean) => void;
}) {
  // The same cached list the section renders, so the label changes in the
  // same moment a method appears in it.
  const { methodsQuery } = usePaymentMethodsAPI();
  const hasMethods = (methodsQuery.data?.methods.length ?? 0) > 0;

  return (
    <StepLayout
      art={<StepArt><Wallet color={colors.brand600} size={36} /></StepArt>}
      body={PAYMENT_STEP.body}
      footer={
        <>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button
            busy={pending}
            label={hasMethods ? PAYMENT_STEP.next : PAYMENT_STEP.skip}
            onPress={() => onFinish(hasMethods)}
            variant={hasMethods ? "primary" : "outline"}
          />
          <Text style={styles.hint}>{PAYMENT_STEP.later}</Text>
        </>
      }
      title={PAYMENT_STEP.title}
    >
      <PaymentMethodsSection defaultCurrency={defaultCurrency} />
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.brand600, fontSize: 14, textAlign: "center" },
  hint: { color: colors.inkSoft, fontSize: 12, lineHeight: 17, textAlign: "center" },
});

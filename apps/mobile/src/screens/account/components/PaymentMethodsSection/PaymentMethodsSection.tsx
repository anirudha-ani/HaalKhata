/** The "Get paid" section of the account screen: the owner's payment methods, with add, edit, remove and star. */

import { Plus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { MAX_PAYMENT_METHODS_PER_USER } from "@haalkhata/shared/payment/payment.constants";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { PaymentMethodRow } from "../PaymentMethodRow/PaymentMethodRow";
import { PaymentMethodSheet } from "../PaymentMethodSheet/PaymentMethodSheet";
import { usePaymentMethods } from "./hooks/usePaymentMethods";

/**
 * Renders the owner's payment methods as a list they manage in place.
 *
 * A card of its own rather than fields inside the profile form: each method
 * saves when its sheet is saved, so nothing here waits for, or is lost by,
 * the profile's "Save changes" button.
 *
 * @param props - Component props.
 * @returns The section, and the add-and-edit sheet while it is open.
 */
export function PaymentMethodsSection({
  defaultCurrency,
}: {
  /** The owner's default currency, which a new method starts on. */
  defaultCurrency: string;
}) {
  const view = usePaymentMethods();

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>
          Get paid
        </Text>
        <Text style={styles.hint}>
          Add how you want to be paid. Only people who owe you can see it, when they settle up.
        </Text>
      </View>

      {view.isLoading ? (
        <Text style={styles.placeholder}>Loading your payment methods…</Text>
      ) : view.loadError ? (
        <View style={styles.loadError}>
          <Text style={styles.loadErrorText}>
            Your payment methods could not be loaded: {view.loadError}
          </Text>
          <Pressable accessibilityRole="button" onPress={view.retryLoad}>
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : view.methods.length === 0 ? (
        <Text style={styles.placeholder}>
          Nothing here yet. Add bKash, a bank account, Venmo, or whatever you use.
        </Text>
      ) : (
        <View style={styles.list}>
          {view.methods.map((method) => (
            <PaymentMethodRow
              error={view.starError.methodId === method.id ? view.starError.message : ""}
              key={method.id}
              method={method}
              onEdit={() => view.openEdit(method)}
              onToggleStar={() => view.toggleStar(method)}
            />
          ))}
        </View>
      )}

      {/* Off while the list is unknown: adding against a list that failed to
          load could pass the cap check here and be refused by the server. */}
      <Button
        disabled={!view.canAdd || view.isLoading || view.loadError !== ""}
        icon={<Plus color={colors.inkSoft} size={16} />}
        label="Add payment method"
        onPress={view.openNew}
        variant="outline"
      />
      {!view.canAdd ? (
        <Text style={styles.capNote}>
          You have {MAX_PAYMENT_METHODS_PER_USER} methods, the most allowed. Remove one to add
          another.
        </Text>
      ) : null}

      {view.sheet.kind !== "closed" ? (
        <PaymentMethodSheet
          defaultCurrency={defaultCurrency}
          // A different method is a different form: remounting resets every field.
          key={view.sheet.kind === "edit" ? view.sheet.method.id : "new"}
          method={view.sheet.kind === "edit" ? view.sheet.method : undefined}
          methods={view.methods}
          onClose={view.closeSheet}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  capNote: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  heading: {
    gap: 2,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  list: {
    gap: spacing.sm,
  },
  loadError: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  loadErrorText: {
    color: colors.brand700,
    fontSize: 14,
    fontWeight: "500",
  },
  placeholder: {
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "dashed",
    borderWidth: 1,
    color: colors.inkSoft,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  retry: {
    color: colors.brand700,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "600",
  },
});

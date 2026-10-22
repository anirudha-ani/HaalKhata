/** Retryable network/resource failure; never disguises missing data as an empty ledger. */

import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { errorMessage } from "@/lib/api/connect";
import { colors, spacing } from "@/lib/theme/theme";
import { Button } from "./Button";

/**
 * Displays the failure and a deliberate retry action.
 * @param props Failed query and its refetch action.
 * @returns Accessible error with retry.
 */
export function ErrorState({ error, retry }: { error: unknown; retry: () => unknown }) {
  return <View style={styles.content}>
    <Text accessibilityRole="alert" style={styles.text}>{error ? errorMessage(error) : "Could not load this information. Please try again."}</Text>
    <Button compact variant="outline" label="Try again" onPress={() => { void retry(); }} />
  </View>;
}
const styles = StyleSheet.create({ content: { gap: spacing.md, padding: spacing.lg }, text: { color: colors.neg700, fontSize: 14, lineHeight: 21 } });

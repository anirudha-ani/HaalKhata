/** What the screen shows before contacts can be read: the explanation, or how to allow access. */

import { StyleSheet, View } from "react-native";
import { CONTACTS_DENIED, CONTACTS_EXPLANATION } from "@haalkhata/shared/contacts/contactsCopy";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { ContactsAccess } from "../../../../utils/contactsAccess";

/**
 * Explains what is checked before the operating system's prompt appears, so
 * the person decides knowing what happens. After a refusal it says how to
 * allow access: asking again while the OS still will, Settings once it won't.
 *
 * @param props - Component props.
 * @returns The card.
 */
export function ContactsAccessCard({
  access,
  error,
  onContinue,
  onOpenSettings,
}: {
  /** The access state that keeps contacts unreadable. */
  access: Extract<ContactsAccess, "undetermined" | "denied" | "blocked">;
  /** Why the last attempt to ask or open Settings failed; "" when it did not. */
  error: string;
  /** Shows the operating system's prompt. */
  onContinue: () => void;
  /** Opens this app's page in Settings. */
  onOpenSettings: () => void;
}) {
  // A refusal the OS will still ask about gets the explanation again and
  // Continue; only a permanent one points at Settings.
  const title = access === "undetermined" ? CONTACTS_EXPLANATION.title : CONTACTS_DENIED.title;
  const body = access === "blocked" ? CONTACTS_DENIED.body : CONTACTS_EXPLANATION.body;
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {access === "blocked" ? (
        <Button label={CONTACTS_DENIED.action} onPress={onOpenSettings} />
      ) : (
        <Button label={CONTACTS_EXPLANATION.action} onPress={onContinue} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  error: { color: colors.neg700, fontSize: 13 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "600" },
});

/** Confirms "send to all": every name it would ask, and the notification each will get. */

import { StyleSheet, View } from "react-native";
import {
  friendRequestTitle,
  SEND_ALL_SHEET,
  sendAllQuestion,
} from "@haalkhata/shared/contacts/contactsCopy";
import type { FoundPerson } from "@haalkhata/shared/contacts/matches";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Lists exactly who the send covers and previews the notification they
 * will receive, word for word (App Review 5.1.2(v)): nothing is sent until
 * the person confirms here. A failure stays in the sheet with the list, so
 * nothing already chosen is lost.
 *
 * @param props - Component props.
 * @returns The sheet.
 */
export function SendAllConfirmSheet({
  people,
  senderName,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  /** Everyone the send would ask. */
  people: FoundPerson[];
  /** The caller's name, as the notification shows it. */
  senderName: string;
  /** Whether the send is in flight. */
  busy: boolean;
  /** Why the last send failed; "" when it did not. */
  error: string;
  /** Sends the requests. */
  onConfirm: () => void;
  /** Closes without sending. */
  onClose: () => void;
}) {
  return (
    <Sheet
      footer={
        <View style={styles.footer}>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button busy={busy} label={SEND_ALL_SHEET.confirm} onPress={onConfirm} />
          <Button disabled={busy} label={SEND_ALL_SHEET.cancel} onPress={onClose} variant="ghost" />
        </View>
      }
      onClose={onClose}
      title={sendAllQuestion(people.length)}
    >
      <View style={styles.body}>
        <View style={styles.preview}>
          <Text style={styles.previewLabel}>{SEND_ALL_SHEET.previewLabel}</Text>
          <Text style={styles.previewText}>{friendRequestTitle(senderName)}</Text>
        </View>
        <View style={styles.names}>
          {people.map((person) => (
            <Text key={person.user.id} numberOfLines={1} style={styles.name}>
              {person.contactNames[0]}
            </Text>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  error: { color: colors.neg700, fontSize: 13 },
  footer: { gap: spacing.sm },
  name: { color: colors.ink, fontSize: 15 },
  names: { gap: spacing.sm },
  preview: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  previewLabel: { color: colors.inkSoft, fontSize: 12 },
  previewText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
});

/** One-time card asking an account that never answered whether contacts may find it. */

import { StyleSheet, View } from "react-native";
import { CONTACT_DISCOVERY_PROMPT } from "@haalkhata/shared/contacts/contactsCopy";
import type { ContactDiscovery } from "@haalkhata/shared/contacts/discovery";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { useContactDiscoveryPrompt } from "./hooks/useContactDiscoveryPrompt";

/**
 * Renders the question with its two answers, or, once answered, what was
 * saved. Renders nothing for someone who answered on an earlier visit.
 *
 * @param props - Component props.
 * @returns The card, or null.
 */
export function ContactDiscoveryPrompt({
  answer,
}: {
  /** The caller's stored answer. */
  answer: ContactDiscovery;
}) {
  const prompt = useContactDiscoveryPrompt(answer);
  if (!prompt.visible) return null;
  return (
    <View style={styles.card}>
      {prompt.asking ? (
        <>
          <Text accessibilityRole="header" style={styles.title}>{CONTACT_DISCOVERY_PROMPT.title}</Text>
          <Text style={styles.body}>{CONTACT_DISCOVERY_PROMPT.body}</Text>
          {prompt.error ? (
            <Text accessibilityRole="alert" style={styles.error}>{prompt.error}</Text>
          ) : null}
          <Button
            busy={prompt.busy}
            label={CONTACT_DISCOVERY_PROMPT.allow}
            onPress={() => void prompt.respond(true)}
          />
          <Button
            disabled={prompt.busy}
            label={CONTACT_DISCOVERY_PROMPT.decline}
            onPress={() => void prompt.respond(false)}
            variant="outline"
          />
        </>
      ) : (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>{prompt.notice}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  error: { color: colors.neg700, fontSize: 13 },
  notice: { color: colors.pos700, fontSize: 13, lineHeight: 19 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "600" },
});

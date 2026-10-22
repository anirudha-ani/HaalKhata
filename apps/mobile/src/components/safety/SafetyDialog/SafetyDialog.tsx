/** Report or block sheet: asks, sends only what was confirmed, and says so in place once it is done. */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  REPORT_REASONS,
  SAFETY_DIALOG_COPY,
  type ReportTargetKind,
  type SafetyDialogMode,
} from "@haalkhata/shared/safety/safety";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { Text } from "@/components/ui/Text";
import { errorMessage } from "@/lib/api/connect";
import { colors, spacing } from "@/lib/theme/theme";
import { useSafetyAPI } from "../hooks/useSafetyAPI";

/**
 * Renders the report or block sheet for one target. A failure stays in the
 * open sheet and can be retried; success replaces the question with its
 * confirmation. That matters most when a header menu opened it: the header
 * stays put while the screen under it scrolls, so a notice placed on the
 * screen could land out of sight. The reporter is never revealed to the
 * person reported.
 *
 * Mount it only while it is open: each mount starts from a clean mutation,
 * so an error from an earlier attempt is never shown against a new one.
 *
 * @param props - Component props.
 * @returns The sheet.
 */
export function SafetyDialog({
  mode,
  targetKind,
  targetId,
  userId,
  onClose,
}: {
  /** Whether this sheet reports the target or blocks `userId`. */
  mode: SafetyDialogMode;
  /** Kind of the visible thing being reported. */
  targetKind: ReportTargetKind;
  /** Identifier of the visible thing being reported. */
  targetId: string;
  /** The person to block; required when `mode` is "block". */
  userId?: string;
  /** Called when the sheet is dismissed or finished. */
  onClose: () => void;
}) {
  const safety = useSafetyAPI();
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [done, setDone] = useState(false);
  const copy = SAFETY_DIALOG_COPY[mode];
  const mutation = mode === "report" ? safety.report : safety.block;
  const busy = mutation.isPending;

  /** Submits only the action the person has confirmed; a failure stays in mutation state for the sheet to show. */
  const submit = async () => {
    try {
      if (mode === "report") await safety.report.mutateAsync({ targetKind, targetId, reason });
      else if (userId) await safety.block.mutateAsync(userId);
      else return;
      setDone(true);
    } catch {
      /* Mutation state shows a retryable error in the open sheet. */
    }
  };

  return (
    <Sheet
      title={done ? copy.doneTitle : copy.title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {done ? (
        <View style={styles.content}>
          <Text accessibilityRole="alert" style={styles.text}>
            {copy.done}
          </Text>
          <Button label="Done" onPress={onClose} />
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.text}>{copy.prompt}</Text>
          {mode === "report"
            ? REPORT_REASONS.map((entry) => (
                <Button
                  key={entry.value}
                  label={`${reason === entry.value ? "✓ " : ""}${entry.label}`}
                  variant="outline"
                  onPress={() => setReason(entry.value)}
                  disabled={busy}
                />
              ))
            : null}
          {mutation.error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorMessage(mutation.error)}
            </Text>
          ) : null}
          <Button label={copy.confirm} busy={busy} onPress={submit} />
          <Button label="Cancel" variant="outline" disabled={busy} onPress={onClose} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
  },
  error: {
    color: colors.neg700,
    fontSize: 13,
  },
  text: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
});

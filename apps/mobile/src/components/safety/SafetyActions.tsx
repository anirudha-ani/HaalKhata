/** Private report and block controls beside visible content. */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { REPORT_REASONS, BLOCK_EXPLANATION, type ReportTargetKind } from "@haalkhata/shared/safety/safety";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { errorMessage } from "@/lib/api/connect";
import { colors, spacing } from "@/lib/theme/theme";
import { useSafetyAPI } from "./hooks/useSafetyAPI";

/**
 * Offers explicit confirmation and retryable failures without exposing the reporter.
 * @param props Visible target and optional person the caller can block.
 * @returns Report/block buttons and a confirmation sheet.
 */
export function SafetyActions({ targetKind, targetId, userId }: { targetKind: ReportTargetKind; targetId: string; userId?: string }) {
  const safety = useSafetyAPI();
  const [mode, setMode] = useState<"report" | "block" | null>(null);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [notice, setNotice] = useState("");
  const busy = safety.report.isPending || safety.block.isPending;
  const failure = mode === "report" ? safety.report.error : safety.block.error;
  const blocked = safety.blocks.data?.users.some((person) => person.id === userId);
  /** Submits only the action the person has confirmed. */
  const submit = async () => {
    try {
      if (mode === "report") { await safety.report.mutateAsync({ targetKind, targetId, reason }); setNotice("Report received. Our support team will review it. Your report is private."); }
      else if (userId) { await safety.block.mutateAsync(userId); setNotice("Person blocked. Manage blocked people in Account."); }
      setMode(null);
    } catch { /* Mutation state shows a retryable error in the open sheet. */ }
  };
  return <View style={styles.content}>
    <View style={styles.actions}>
      <Button compact variant="ghost" label="Report" onPress={() => { safety.report.reset(); setMode("report"); }} />
      {userId && !blocked ? <Button compact variant="ghost" label="Block person" onPress={() => { safety.block.reset(); setMode("block"); }} /> : null}
      {blocked ? <Text style={styles.text}>Blocked</Text> : null}
    </View>
    {notice ? <Text accessibilityRole="alert" style={styles.text}>{notice}</Text> : null}
    {mode ? <Sheet title={mode === "report" ? "Report a safety concern" : "Block this person?"} onClose={() => { if (!busy) setMode(null); }}>
      <View style={styles.content}>
        <Text style={styles.text}>{mode === "block" ? BLOCK_EXPLANATION : "Choose a reason. The person you report is not notified. Contact Support for urgent help."}</Text>
        {mode === "report" ? REPORT_REASONS.map((entry) => <Button key={entry.value} label={`${reason === entry.value ? "✓ " : ""}${entry.label}`} variant="outline" onPress={() => setReason(entry.value)} disabled={busy} />) : null}
        {failure ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage(failure)}</Text> : null}
        <Button label={mode === "report" ? "Send report" : "Confirm block"} busy={busy} onPress={submit} />
        <Button label="Cancel" variant="outline" disabled={busy} onPress={() => setMode(null)} />
      </View>
    </Sheet> : null}
  </View>;
}
const styles = StyleSheet.create({ content: { gap: spacing.sm }, actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  text: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 }, error: { color: colors.neg700, fontSize: 13 } });

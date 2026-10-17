/** Private report and block controls beside visible content. */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { type ReportTargetKind, type SafetyDialogMode } from "@haalkhata/shared/safety/safety";
import { Button } from "@/components/ui/Button";
import { colors } from "@/lib/theme/theme";
import { useSafetyAPI } from "./hooks/useSafetyAPI";
import { SafetyDialog } from "./SafetyDialog/SafetyDialog";

/**
 * Offers "Report" and, for another person, "Block person" beside the
 * content they concern. Each opens the confirmation sheet, which carries
 * its own errors and its own confirmation without exposing the reporter.
 * @param props Visible target and optional person the caller can block.
 * @returns Report/block buttons and a confirmation sheet.
 */
export function SafetyActions({ targetKind, targetId, userId }: { targetKind: ReportTargetKind; targetId: string; userId?: string }) {
  const safety = useSafetyAPI();
  const [mode, setMode] = useState<SafetyDialogMode | null>(null);
  const blocked = safety.blocks.data?.users.some((person) => person.id === userId);
  return <View style={styles.actions}>
    <Button compact variant="ghost" label="Report" onPress={() => setMode("report")} />
    {userId && !blocked ? <Button compact variant="ghost" label="Block person" onPress={() => setMode("block")} /> : null}
    {blocked ? <Text style={styles.text}>Blocked</Text> : null}
    {mode ? <SafetyDialog mode={mode} targetKind={targetKind} targetId={targetId} userId={userId} onClose={() => setMode(null)} /> : null}
  </View>;
}
const styles = StyleSheet.create({ actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  text: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 } });

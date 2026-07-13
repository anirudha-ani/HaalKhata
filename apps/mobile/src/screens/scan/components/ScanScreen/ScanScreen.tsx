/** Scan screen orchestrator: pick who it's with, capture a receipt photo, itemize with AI, save. */

import { useLocalSearchParams } from "expo-router";
import { Camera, Images, ScanLine } from "lucide-react-native";
import { Image, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/shell/Screen";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Spinner } from "@/components/ui/Spinner";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { DraftEditor } from "./components/DraftEditor/DraftEditor";
import { useScan } from "./hooks/useScan";

/**
 * Renders the receipt-scanning screen: the group/friend picker, the camera /
 * photo-library capture zone with preview, the "Itemize with AI" action, the
 * DraftEditor for the parsed result, and the save button with validation
 * hints.
 *
 * @returns The scan screen content, with a spinner while picker data loads.
 */
export function ScanScreen() {
  const params = useLocalSearchParams<{ group?: string }>();
  const scan = useScan(params.group ?? "");

  return (
    <Screen header={<ScreenHeader />}>
      <View>
        <Text style={styles.title}>Scan a receipt</Text>
        <Text style={styles.subtitle}>
          Snap a photo — items, tax and tip are extracted automatically, then you assign who had
          what.
        </Text>
      </View>

      {scan.isLoading ? (
        <Spinner />
      ) : (
        <>
          {/* Context picker */}
          <View style={styles.contextSection}>
            <Text style={styles.sectionLabel}>WHO IS THIS WITH?</Text>
            {scan.groups.length > 0 ? (
              <View style={styles.chipRow}>
                {scan.groups.map((summary) =>
                  summary.group ? (
                    <Chip
                      key={summary.group.id}
                      label={summary.group.name}
                      onPress={() => scan.setContext(`g:${summary.group?.id}`)}
                      selected={scan.context === `g:${summary.group.id}`}
                    />
                  ) : null,
                )}
              </View>
            ) : null}
            {scan.friends.length > 0 ? (
              <View style={styles.chipRow}>
                {scan.friends.map((friend) =>
                  friend.user ? (
                    <Chip
                      key={friend.user.id}
                      label={friend.user.name}
                      onPress={() => scan.setContext(`f:${friend.user?.id}`)}
                      selected={scan.context === `f:${friend.user.id}`}
                    />
                  ) : null,
                )}
              </View>
            ) : null}
          </View>

          {/* Capture zone */}
          <View style={[styles.captureZone, scan.photo ? styles.captureZoneFilled : null]}>
            {scan.photo ? (
              <Image
                accessibilityLabel="Receipt preview"
                resizeMode="contain"
                source={{ uri: scan.photo.uri }}
                style={styles.preview}
              />
            ) : (
              <>
                <ScanLine color={colors.brand600} size={32} />
                <Text style={styles.captureTitle}>Take a photo or pick one</Text>
                <Text style={styles.captureHint}>JPEG, PNG or WebP · up to 8 MB</Text>
              </>
            )}
            <View style={styles.captureActions}>
              <View style={styles.captureAction}>
                <Button
                  compact
                  icon={<Camera color={colors.white} size={16} />}
                  label="Camera"
                  onPress={() => void scan.pickPhoto(true)}
                />
              </View>
              <View style={styles.captureAction}>
                <Button
                  compact
                  icon={<Images color={colors.inkSoft} size={16} />}
                  label="Library"
                  onPress={() => void scan.pickPhoto(false)}
                  variant="outline"
                />
              </View>
            </View>
          </View>

          {scan.photo && scan.items === null ? (
            <Button
              busy={scan.isParsing}
              icon={<ScanLine color={colors.white} size={18} />}
              label="Itemize with AI"
              onPress={scan.parseNow}
            />
          ) : null}

          {scan.isParsing ? <Spinner label="Extracting items, tax and tip…" /> : null}

          <DraftEditor scan={scan} />

          {scan.error ? <Text style={styles.error}>{scan.error}</Text> : null}

          {scan.items !== null ? (
            <View style={styles.saveSection}>
              {scan.unassignedCount > 0 ? (
                <Text style={styles.warning}>
                  {scan.unassignedCount} item{scan.unassignedCount === 1 ? " is" : "s are"}{" "}
                  unassigned
                </Text>
              ) : null}
              {scan.context === "" ? (
                <Text style={styles.warning}>choose a group or friend above</Text>
              ) : null}
              <Button
                busy={scan.isSaving}
                disabled={!scan.canSave}
                label="Save itemized expense"
                onPress={scan.save}
              />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  captureAction: {
    flex: 1,
  },
  captureActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    width: "100%",
  },
  captureHint: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  captureTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  captureZone: {
    alignItems: "center",
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
    borderRadius: radii.lg,
    borderStyle: "dashed",
    borderWidth: 2,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  captureZoneFilled: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderStyle: "solid",
    borderWidth: 1,
    padding: spacing.lg,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  contextSection: {
    gap: spacing.sm,
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
    fontWeight: "500",
  },
  preview: {
    borderRadius: radii.md,
    height: 260,
    width: "100%",
  },
  saveSection: {
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: "700",
  },
  warning: {
    color: colors.neg600,
    fontSize: 14,
    fontWeight: "500",
  },
});

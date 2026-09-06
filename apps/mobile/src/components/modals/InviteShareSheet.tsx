/** Sheet showing an invite link as a QR code, with copy and share actions. */

import * as Clipboard from "expo-clipboard";
import { Copy, Share2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { inviteUrl } from "@haalkhata/shared/invite/invite";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { COPIED_BADGE_MS } from "./modals.constants";

/**
 * Renders a share sheet for any invite link (profile, group join): the link
 * as a scannable QR code for the person standing next to you, the URL itself
 * readable, a copy button, and the OS share sheet. Nothing leaves the device
 * until one of those is chosen; opening the sheet only fetched the link.
 *
 * @param props - Component props.
 * @param props.title - Sheet heading, naming what is being shared.
 * @param props.explainer - One sentence on what the link lets its holder do.
 * @param props.token - The invite link's token, already minted.
 * @param props.share - Opens the OS share sheet with the link's message.
 * @param props.onClose - Called when the sheet is dismissed.
 * @returns The sheet.
 */
export function InviteShareSheet({
  title,
  explainer,
  token,
  share,
  onClose,
}: {
  title: string;
  explainer: string;
  token: string;
  share: () => Promise<unknown>;
  onClose: () => void;
}) {
  const linkUrl = inviteUrl(token);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_BADGE_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyLink = async () => {
    await Clipboard.setStringAsync(linkUrl);
    setCopied(true);
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <View style={styles.body}>
        <Text style={styles.explainer}>{explainer}</Text>
        {/* White behind the code on purpose: scanners want contrast. */}
        <View style={styles.qrCard}>
          <QRCode value={linkUrl} size={192} backgroundColor={colors.white} color={colors.ink} />
        </View>
        <Text selectable style={styles.linkText}>
          {linkUrl}
        </Text>
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              icon={<Copy color={colors.white} size={16} />}
              label={copied ? "Copied ✓" : "Copy link"}
              onPress={copyLink}
            />
          </View>
          <View style={styles.action}>
            <Button
              icon={<Share2 color={colors.inkSoft} size={16} />}
              label="Share…"
              onPress={share}
              variant="outline"
            />
          </View>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  action: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%",
  },
  body: {
    alignItems: "center",
    gap: spacing.md,
  },
  explainer: {
    color: colors.inkSoft,
    fontSize: 13,
    textAlign: "center",
  },
  linkText: {
    color: colors.inkSoft,
    fontSize: 12,
    textAlign: "center",
  },
  qrCard: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
});

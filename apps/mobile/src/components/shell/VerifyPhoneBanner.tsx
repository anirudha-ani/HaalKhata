/** Prompt shown while the account carries a phone number that never passed SMS verification (§35). */

import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Launch-scoped, not persisted: the prompt returns on the next app launch,
 * because an unverified number stays claimable by anyone proving SMS
 * possession (§34), and that does not stop being true when the banner is
 * closed. A module flag beats storage here; there is nothing to migrate or
 * corrupt, and "once per launch" is exactly the nudge cadence wanted.
 */
let dismissedThisLaunch = false;

/**
 * Renders the verify-your-number prompt when the signed-in user has a phone
 * without the verification stamp: a number written before verification
 * existed. Verifying happens on the Account screen, which this links to.
 *
 * @param props - Component props.
 * @param props.currentUser - The signed-in user, or undefined while loading.
 * @returns The banner, or null when there is nothing to prompt about.
 */
export function VerifyPhoneBanner({ currentUser }: { currentUser: User | undefined }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(dismissedThisLaunch);
  if (dismissed || !currentUser || currentUser.phone === "" || currentUser.phoneVerified) {
    return null;
  }
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>
        <Text style={styles.bannerLead}>Verify your phone number. </Text>
        {currentUser.phone} was added before verification existed. Confirm it&apos;s yours with a
        quick SMS code so it stays attached to your account.
      </Text>
      <View style={styles.bannerActions}>
        <Pressable onPress={() => router.push("/account")} style={styles.verifyButton}>
          <Text style={styles.verifyButtonText}>Verify now</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            dismissedThisLaunch = true;
            setDismissed(true);
          }}
        >
          <Text style={styles.dismissText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.neg50,
    borderColor: colors.neg600,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    padding: spacing.md,
  },
  bannerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  bannerLead: {
    fontWeight: "700",
  },
  bannerText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  dismissText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: "600",
  },
  verifyButton: {
    backgroundColor: colors.brand600,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  verifyButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
});

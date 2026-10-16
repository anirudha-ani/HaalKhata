/** The details of the payment method a payer has selected: every identifier with Copy, a link where one exists, and the owner's note. */

import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import * as Clipboard from "expo-clipboard";
import { Check, ClipboardList, Copy, ExternalLink, TriangleAlert } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { detailLabel, detailValueText } from "@haalkhata/shared/payment/detailKinds";
import {
  changeClock,
  detailCopyText,
  keyedDetails,
  linkHost,
  methodCopyText,
  methodDisplayName,
  recentChange,
} from "@haalkhata/shared/payment/formatMethod";
import { appPaymentLink } from "@haalkhata/shared/payment/appLink";
import { displayHandle, findPaymentMethod } from "@haalkhata/shared/payment/methods";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { COPY_FAILED_LABEL } from "@haalkhata/shared/payment/copy";
import { COPIED_BADGE_MS, COPY_ALL_KEY, OPEN_LINK_FAILED } from "./modals.constants";

/**
 * Renders where to send the money for the method the payer selected: each
 * detail on its own line with a Copy button, a way to open the app or the
 * owner's link where there is one, the owner's note, and a word about how
 * recently the details came to be what they are.
 *
 * Values wrap and are never cut short. An ellipsis is harmless on a
 * username and wrong on an account number: a payer who types what they see
 * must be seeing all of it.
 *
 * It only offers a link where one exists and only claims a prefilled amount
 * where the app accepts one. Zelle has no universal link at all and Cash
 * App cannot carry an amount. A link the owner typed is offered by its host
 * name, which is what the payer should check before opening it.
 *
 * A method edited in the last two weeks says so, as a warning: details that
 * suddenly differ are how a payment gets redirected, and the payer is the
 * only one in a position to ask. A method that is merely new says so quietly.
 *
 * @param props - Component props.
 * @returns The details card.
 */
export function PayeeMethodDetails({
  method,
  methods,
  readAt,
  removedAt,
  firstName,
  amountCents,
  currency,
  note,
}: {
  /** The method being paid into. */
  method: PaymentMethod;
  /** All of the payee's methods, which the change note compares this one with. */
  methods: readonly PaymentMethod[];
  /** The server's clock when the methods were read; "" when it sent none. */
  readAt: string;
  /** When the payee last removed a method; "" when never. */
  removedAt: string;
  /** First name of the person being paid. */
  firstName: string;
  /** The amount being paid, for an app link that can carry it. */
  amountCents: number;
  /** The currency being paid in, which decides whether a link may carry the amount. */
  currency: string;
  /** The payment note, for an app link that can carry it. */
  note: string;
}) {
  // Which Copy button last succeeded: a detail's key, or the "copy all" key.
  const [copiedKey, setCopiedKey] = useState("");
  // Which Copy button last failed. Said on the button: a payer who is told
  // nothing pastes whatever was on the clipboard before.
  const [failedKey, setFailedKey] = useState("");
  // Set when a link button could not open its link.
  const [linkFailed, setLinkFailed] = useState(false);
  // The device's clock is read once per mount and only stands in when the
  // server sent none: the clock is not a render input.
  const [openedAtMs] = useState(() => Date.now());

  // The "Copied" confirmation, and the failure, clear themselves.
  useEffect(() => {
    if (copiedKey === "" && failedKey === "") return;
    const timer = setTimeout(() => {
      setCopiedKey("");
      setFailedKey("");
    }, COPIED_BADGE_MS);
    return () => clearTimeout(timer);
  }, [copiedKey, failedKey]);

  /**
   * Copies some text and marks its button as done. Only on success: saying
   * "Copied" when nothing was copied would be worse than saying nothing.
   *
   * @param buttonKey - Which button was pressed.
   * @param text - What to put on the clipboard.
   */
  const copy = async (buttonKey: string, text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setFailedKey("");
      setCopiedKey(buttonKey);
    } catch {
      // Nothing was copied, and the button says so.
      setCopiedKey("");
      setFailedKey(buttonKey);
    }
  };

  /**
   * Opens a link, and says so under the buttons when the device has nothing
   * to open it with.
   *
   * @param link - The https link to open.
   */
  const openLink = async (link: string) => {
    setLinkFailed(false);
    try {
      await Linking.openURL(link);
    } catch {
      setLinkFailed(true);
    }
  };

  /**
   * What a Copy button shows for its last press.
   *
   * @param buttonKey - Which button.
   * @param resting - Its label when nothing has just happened.
   * @returns The label to show.
   */
  const copyLabel = (buttonKey: string, resting: string) => {
    if (copiedKey === buttonKey) return "Copied";
    return failedKey === buttonKey ? COPY_FAILED_LABEL : resting;
  };

  const builtIn = findPaymentMethod(method.preset);
  // A built-in app's link is built from its one detail. It carries the
  // amount only when the app would read it as the money actually owed.
  const appLink = appPaymentLink({
    preset: method.preset,
    handle: method.details[0]?.value ?? "",
    methodCurrency: method.currency,
    amountCents,
    currency,
    note,
  });
  // Listed once each: the same link twice is one button, and one list key.
  const ownerLinks = [
    ...new Set(
      method.details
        .filter((detail) => detail.kind === "link" && linkHost(detail.value) !== "")
        .map((detail) => detail.value),
    ),
  ];
  const change = recentChange(method, {
    nowMs: changeClock(readAt, openedAtMs),
    removedAt,
    methods,
  });

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {firstName.toUpperCase()}&apos;S {methodDisplayName(method).toUpperCase()}
      </Text>

      {/* Before the details, not after them: it is about whether to use them. */}
      {change?.caution ? (
        <Text accessibilityRole="alert" style={styles.changed}>
          {change.text}. If that is unexpected, check with {firstName} before you pay.
        </Text>
      ) : change ? (
        <Text style={styles.hint}>{change.text}.</Text>
      ) : null}

      <View style={styles.lines}>
        {keyedDetails(method.details).map(({ key, detail }) => (
          <View key={key} style={styles.line}>
            <View style={styles.lineText}>
              <Text style={styles.lineLabel}>{detailLabel(detail)}</Text>
              <Text selectable style={styles.lineValue}>
                {/* A username is shown the way the app's own profile prints it. */}
                {builtIn && detail.kind === "username"
                  ? displayHandle(method.preset, detail.value)
                  : detailValueText(detail)}
              </Text>
            </View>
            <Button
              compact
              icon={
                copiedKey === key ? (
                  <Check color={colors.pos600} size={14} />
                ) : failedKey === key ? (
                  <TriangleAlert color={colors.brand600} size={14} />
                ) : (
                  <Copy color={colors.inkSoft} size={14} />
                )
              }
              label={copyLabel(key, "Copy")}
              onPress={() => void copy(key, detailCopyText(method, detail))}
              variant="outline"
            />
          </View>
        ))}
      </View>

      {ownerLinks.map((link) => (
        <Button
          icon={<ExternalLink color={colors.white} size={16} />}
          key={link}
          label={`Open ${linkHost(link)}`}
          onPress={() => void openLink(link)}
        />
      ))}

      {appLink ? (
        <>
          {appLink.url ? (
            <Button
              icon={<ExternalLink color={colors.white} size={16} />}
              label={`Open ${appLink.label}`}
              onPress={() => void openLink(appLink.url)}
            />
          ) : null}
          <Text style={styles.hint}>{appLink.hint}</Text>
        </>
      ) : null}

      {linkFailed ? (
        <Text accessibilityRole="alert" style={styles.linkFailed}>
          {OPEN_LINK_FAILED}
        </Text>
      ) : null}

      {method.note ? (
        <View style={styles.note}>
          <Text style={styles.lineLabel}>Note from {firstName}</Text>
          <Text selectable style={styles.noteText}>
            {method.note}
          </Text>
        </View>
      ) : null}

      {method.details.length > 1 ? (
        <Button
          icon={
            copiedKey === COPY_ALL_KEY ? (
              <Check color={colors.pos600} size={16} />
            ) : failedKey === COPY_ALL_KEY ? (
              <TriangleAlert color={colors.brand600} size={16} />
            ) : (
              <ClipboardList color={colors.inkSoft} size={16} />
            )
          }
          label={copyLabel(COPY_ALL_KEY, "Copy all")}
          onPress={() => void copy(COPY_ALL_KEY, methodCopyText(method))}
          variant="outline"
        />
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  changed: {
    backgroundColor: colors.neg50,
    borderRadius: radii.sm,
    color: colors.neg700,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  line: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  lineLabel: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  lineText: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  linkFailed: {
    color: colors.brand600,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
  },
  lineValue: {
    color: colors.ink,
    fontFamily: "monospace",
    fontSize: 14,
  },
  lines: {
    gap: spacing.md,
  },
  note: {
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noteText: {
    color: colors.ink,
    fontSize: 14,
  },
  title: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },
});

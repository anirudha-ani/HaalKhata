/** Find friends: people in the caller's contacts who are on HaalKhata, with add, accept and send to all. */

import { Share2, Users } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import {
  CONTACTS_LIMITED,
  CONTACTS_NO_MATCHES,
  FIND_FRIENDS_COPY,
  checkingLabel,
} from "@haalkhata/shared/contacts/contactsCopy";
import { ContactDiscoveryPrompt } from "@/components/account/ContactDiscoveryPrompt/ContactDiscoveryPrompt";
import { DetailHeader } from "@/components/shell/DetailHeader/DetailHeader";
import { Screen } from "@/components/shell/Screen/Screen";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Text } from "@/components/ui/Text";
import { useErrorToast } from "@/components/ui/ToastProvider";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { ContactsAccessCard } from "./components/ContactsAccessCard/ContactsAccessCard";
import { FoundSection } from "./components/FoundSection/FoundSection";
import { SendAllBar } from "./components/SendAllBar/SendAllBar";
import { SendAllConfirmSheet } from "./components/SendAllConfirmSheet/SendAllConfirmSheet";
import { useFindFriends } from "./hooks/useFindFriends";

/**
 * Renders the screen through its states: checking access, the explanation
 * before the OS prompt (or how to allow access after a refusal), reading and
 * matching with a count, then the found people grouped by what can be done
 * with each. Row failures surface through the screen's toast layer; a failed
 * lookup offers a retry; "send to all" confirms in a sheet that lists
 * everyone first. Someone who never answered is told here too that they can be found,
 * since they are about to find others.
 *
 * @returns The Find friends screen.
 */
export function FindFriendsScreen() {
  const finder = useFindFriends();
  useErrorToast(finder.actionError);
  const { groups } = finder;

  /** @returns The part of the screen below the discoverability prompt. */
  const body = () => {
    if (finder.checkingAccess || (!finder.me && !finder.meFailure)) return <Spinner />;
    if (!finder.me) return <ErrorState error={finder.meFailure} retry={finder.retryMe} />;
    if (finder.access === "undetermined" || finder.access === "denied" || finder.access === "blocked") {
      return (
        <ContactsAccessCard
          access={finder.access}
          error={finder.accessError}
          onContinue={() => void finder.allow()}
          onOpenSettings={() => void finder.openSettings()}
        />
      );
    }
    if (finder.access === undefined) {
      return <ErrorState error={new Error(finder.accessError)} retry={() => void finder.allow()} />;
    }
    if (finder.status !== "done") {
      return (
        <Spinner
          label={finder.status === "matching" ? checkingLabel(finder.contactCount) : FIND_FRIENDS_COPY.reading}
        />
      );
    }
    if (finder.lookupFailure) return <ErrorState error={finder.lookupFailure} retry={finder.retry} />;
    return (
      <>
        {finder.access === "limited" ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{CONTACTS_LIMITED.body}</Text>
            <Button compact label={CONTACTS_LIMITED.action} onPress={() => void finder.chooseMore()} variant="outline" />
          </View>
        ) : null}
        {finder.partialNote ? <Text style={styles.partial}>{finder.partialNote}</Text> : null}
        {finder.notice ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>{finder.notice}</Text>
        ) : null}
        {finder.found === 0 ? (
          <EmptyState
            action={
              <Button
                busy={finder.sharingLink}
                icon={<Share2 color={colors.inkSoft} size={16} />}
                label={FIND_FRIENDS_COPY.shareLink}
                onPress={() => void finder.shareInviteLink()}
                variant="outline"
              />
            }
            hint={CONTACTS_NO_MATCHES.body}
            icon={<Users color={colors.inkSoft} size={28} />}
            title={CONTACTS_NO_MATCHES.title}
          />
        ) : (
          <>
            <FoundSection
              busyIds={finder.busyIds}
              onAccept={(userId) => void finder.accept(userId)}
              onAdd={(userId) => void finder.add(userId)}
              people={groups.incoming}
              title={FIND_FRIENDS_COPY.incoming}
            />
            {groups.requestable.length > 1 ? (
              <SendAllBar count={groups.requestable.length} onPress={finder.openSendAll} />
            ) : null}
            <FoundSection
              busyIds={finder.busyIds}
              onAccept={(userId) => void finder.accept(userId)}
              onAdd={(userId) => void finder.add(userId)}
              people={groups.requestable}
              title={FIND_FRIENDS_COPY.requestable}
            />
            <FoundSection
              busyIds={finder.busyIds}
              onAccept={(userId) => void finder.accept(userId)}
              onAdd={(userId) => void finder.add(userId)}
              people={groups.requested}
              title={FIND_FRIENDS_COPY.requested}
            />
            <FoundSection
              busyIds={finder.busyIds}
              onAccept={(userId) => void finder.accept(userId)}
              onAdd={(userId) => void finder.add(userId)}
              people={groups.friends}
              title={FIND_FRIENDS_COPY.friends}
            />
          </>
        )}
      </>
    );
  };

  return (
    <Screen header={<DetailHeader title={FIND_FRIENDS_COPY.title} />}>
      <View style={styles.content}>
        {finder.me ? <ContactDiscoveryPrompt answer={finder.me.contactDiscovery} /> : null}
        {body()}
      </View>
      {finder.confirmingAll ? (
        <SendAllConfirmSheet
          busy={finder.sendingAll}
          error={finder.sendAllError}
          onClose={finder.closeSendAll}
          onConfirm={() => void finder.sendAll()}
          people={groups.requestable}
          senderName={finder.me?.name ?? ""}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  bannerText: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  content: { gap: spacing.lg },
  notice: {
    backgroundColor: colors.pos50,
    borderRadius: radii.lg,
    color: colors.pos700,
    fontSize: 14,
    fontWeight: "500",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  partial: {
    backgroundColor: colors.neg50,
    borderRadius: radii.lg,
    color: colors.neg700,
    fontSize: 13,
    lineHeight: 19,
    padding: spacing.md,
  },
});

/** What the find-friends step shows once contacts can be read: progress, then the people found. */

import { Share2, Users } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import {
  CONTACTS_LIMITED,
  CONTACTS_NO_MATCHES,
  FIND_FRIENDS_COPY,
  checkingLabel,
} from "@haalkhata/shared/contacts/contactsCopy";
import { FoundSection } from "@/components/contacts/FoundSection/FoundSection";
import { RequestPreviewNote } from "@/components/contacts/RequestPreviewNote/RequestPreviewNote";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Text } from "@/components/ui/Text";
import type { FindFriendsController } from "@/lib/contacts/hooks/useFindFriends";
import { tapFeedback } from "@/lib/motion/haptics";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the lookup's progress, then the found people grouped by what can
 * be done with each, the way Find friends does. Requests go one person at a
 * time from each row's Add, under a line quoting the notification they send
 * (App Review 5.1.2(v): no select-all, and show the message first).
 * A row's failure shows above the list, never only in a toast.
 *
 * @param props - Component props.
 * @returns The results.
 */
export function FriendResults({ finder }: { finder: FindFriendsController }) {
  if (finder.status !== "done") {
    return (
      <Spinner
        label={finder.status === "matching" ? checkingLabel(finder.contactCount) : FIND_FRIENDS_COPY.reading}
      />
    );
  }
  if (finder.lookupFailure) return <ErrorState error={finder.lookupFailure} retry={finder.retry} />;

  /**
   * Adds one person with a light tap of feedback as the request goes.
   *
   * @param userId - The account to ask.
   */
  const addPerson = (userId: string) => {
    tapFeedback();
    void finder.add(userId);
  };
  /**
   * Accepts one person's request, with the same feedback.
   *
   * @param userId - The account whose request to accept.
   */
  const accept = (userId: string) => {
    tapFeedback();
    void finder.accept(userId);
  };

  return (
    <View style={styles.results}>
      {finder.access === "limited" ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{CONTACTS_LIMITED.body}</Text>
          <Button compact label={CONTACTS_LIMITED.action} onPress={() => void finder.chooseMore()} variant="outline" />
        </View>
      ) : null}
      {finder.partialNote ? <Text style={styles.partial}>{finder.partialNote}</Text> : null}
      {finder.actionError ? <Text accessibilityRole="alert" style={styles.error}>{finder.actionError}</Text> : null}
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
          {finder.groups.requestable.length > 0 && finder.me ? (
            <RequestPreviewNote senderName={finder.me.name} />
          ) : null}
          <FoundSection
            busyIds={finder.busyIds}
            onAccept={accept}
            onAdd={addPerson}
            people={finder.groups.incoming}
            title={FIND_FRIENDS_COPY.incoming}
          />
          <FoundSection
            busyIds={finder.busyIds}
            onAccept={accept}
            onAdd={addPerson}
            people={finder.groups.requestable}
            title={FIND_FRIENDS_COPY.requestable}
          />
          <FoundSection
            busyIds={finder.busyIds}
            onAccept={accept}
            onAdd={addPerson}
            people={finder.groups.requested}
            title={FIND_FRIENDS_COPY.requested}
          />
          <FoundSection
            busyIds={finder.busyIds}
            onAccept={accept}
            onAdd={addPerson}
            people={finder.groups.friends}
            title={FIND_FRIENDS_COPY.friends}
          />
        </>
      )}
    </View>
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
  error: { color: colors.neg700, fontSize: 13, textAlign: "center" },
  partial: {
    backgroundColor: colors.neg50,
    borderRadius: radii.lg,
    color: colors.neg700,
    fontSize: 13,
    lineHeight: 19,
    padding: spacing.md,
  },
  results: { gap: spacing.lg },
});

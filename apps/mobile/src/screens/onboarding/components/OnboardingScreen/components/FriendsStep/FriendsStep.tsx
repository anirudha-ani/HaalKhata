/** The find-friends step: say what reading contacts does, ask once, then show who is already here. */

import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { CONTACTS_EXPLANATION, CONTACTS_NO_MATCHES } from "@haalkhata/shared/contacts/contactsCopy";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useFindFriends } from "@/lib/contacts/hooks/useFindFriends";
import { colors } from "@/lib/theme/theme";
import { FRIENDS_STEP } from "../../../../constants/onboardingCopy";
import { StepLayout } from "../StepLayout/StepLayout";
import { ContactsArt } from "./components/ContactsArt/ContactsArt";
import { FriendResults } from "./components/FriendResults/FriendResults";

/** What the step did, for the closing screen. */
export interface FriendsSummary {
  sent: number;
  accepted: number;
}

/**
 * Before iOS asks for contacts, the step explains what is checked and what
 * stays on the phone, with one button: Continue, which brings up the system
 * prompt. Apple asks that a screen shown before its alert lead only to the
 * alert (no "Not now" there; the alert is where the person says no).
 *
 * Allowed, even partly: the lookup runs and the found people appear with
 * Add and Accept on each row. Refused: there is nothing to show, so the flow
 * moves on (Friends keeps a way to allow it later).
 *
 * @param props - Component props.
 * @returns The step.
 */
export function FriendsStep({ onContinue }: { onContinue: (summary: FriendsSummary) => void }) {
  const finder = useFindFriends();
  const [asking, setAsking] = useState(false);
  const readable = finder.access === "all" || finder.access === "limited";
  const refused = finder.access === "denied" || finder.access === "blocked";
  const summary = { sent: finder.sentCount, accepted: finder.acceptedCount };

  // Refused (now, or in Settings while the flow was open): nothing to show,
  // so move on, once.
  const leftRef = useRef(false);
  useEffect(() => {
    if (!refused || leftRef.current) return;
    leftRef.current = true;
    onContinue({ sent: 0, accepted: 0 });
  }, [refused, onContinue]);

  /** Shows the system prompt; the access query updates the step either way. */
  const askSystem = async () => {
    setAsking(true);
    await finder.allow();
    setAsking(false);
  };

  if (readable) {
    const found = finder.status === "done" && !finder.lookupFailure ? finder.found : -1;
    return (
      <StepLayout
        body={found > 0 ? FRIENDS_STEP.foundBody : found === 0 ? CONTACTS_NO_MATCHES.body : undefined}
        footer={<Button label={FRIENDS_STEP.next} onPress={() => onContinue(summary)} />}
        title={found > 0 ? FRIENDS_STEP.foundTitle(found) : found === 0 ? CONTACTS_NO_MATCHES.title : CONTACTS_EXPLANATION.title}
      >
        <FriendResults finder={finder} />
      </StepLayout>
    );
  }

  return (
    <StepLayout
      art={<ContactsArt />}
      benefits={FRIENDS_STEP.benefits}
      body={CONTACTS_EXPLANATION.body}
      footer={
        finder.accessError ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>{finder.accessError}</Text>
            <Button busy={asking} label={FRIENDS_STEP.retryAccess} onPress={() => void askSystem()} />
            <Button label={FRIENDS_STEP.continueWithout} onPress={() => onContinue(summary)} variant="ghost" />
          </>
        ) : (
          <Button
            busy={asking || finder.checkingAccess || refused}
            label={CONTACTS_EXPLANATION.action}
            onPress={() => void askSystem()}
          />
        )
      }
      title={CONTACTS_EXPLANATION.title}
    />
  );
}

const styles = StyleSheet.create({
  error: { color: colors.brand600, fontSize: 14, textAlign: "center" },
});

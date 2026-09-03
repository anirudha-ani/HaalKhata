/** Deep-link landing for invite links: who invited you, to what, one tap in. */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { authClient, errorMessage, socialClient } from "@/lib/api/connect";
import { stashPendingInvite } from "@/lib/invite/pendingInvite";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the join screen a universal link opens. Preview needs no session;
 * accepting does — a signed-out person's token is stashed and the login flow
 * completes the invite the moment a session exists.
 *
 * @returns The invite landing content.
 */
export default function JoinRoute() {
  const { token: rawToken } = useLocalSearchParams<{ token: string }>();
  const token = typeof rawToken === "string" ? rawToken : "";
  const router = useRouter();

  const preview = useQuery({
    queryKey: ["invite-preview", token],
    queryFn: () => socialClient.previewInviteLink({ token }),
    retry: false,
  });
  // Failing just means "not signed in" — a state, not an error.
  const viewer = useQuery({
    queryKey: ["me"],
    queryFn: () => authClient.getMe({}),
    retry: false,
  });

  const [requestSent, setRequestSent] = useState(false);
  const accept = useMutation({
    mutationFn: () => socialClient.acceptInviteLink({ token }),
    onSuccess: (result) => {
      // A profile link produces a pending request, not a friendship yet —
      // redirecting to Friends would show nothing and read as a silent fail.
      if (preview.data?.kind === "profile") {
        setRequestSent(true);
        return;
      }
      router.replace(result.groupId ? `/groups/${result.groupId}` : "/friends");
    },
  });

  /** Stashes the token and detours through login; sign-in completes the invite. */
  const signInFirst = async () => {
    await stashPendingInvite(token);
    router.replace("/login");
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        {preview.isLoading ? (
          <Spinner />
        ) : preview.isError ? (
          <>
            <Text style={styles.title}>This invite link isn&apos;t active</Text>
            <Text style={styles.body}>{errorMessage(preview.error)}</Text>
            <Button label="Open HaalKhata" onPress={() => router.replace("/")} />
          </>
        ) : preview.data ? (
          <>
            <Text style={styles.title}>
              {preview.data.kind === "group"
                ? `${preview.data.inviterName} invited you to “${preview.data.groupName}”`
                : preview.data.kind === "profile"
                  ? `${preview.data.inviterName} wants to connect on HaalKhata`
                  : `${preview.data.inviterName} invited you to HaalKhata`}
            </Text>
            <Text style={styles.body}>
              {preview.data.kind === "group"
                ? `A shared expense group with ${preview.data.memberCount} ${
                    preview.data.memberCount === 1 ? "member" : "members"
                  }. Accepting adds you to it.`
                : preview.data.kind === "profile"
                  ? "Accepting sends them a friend request; you'll be connected once they confirm."
                  : `They added you as “${preview.data.invitedName}”. Accepting brings that invitation — friendships and any group seats — onto your account.`}
            </Text>
            {viewer.data ? (
              requestSent ? (
                <Text style={styles.requested}>
                  Request sent — {preview.data.inviterName} will confirm from their side.
                </Text>
              ) : (
              <>
                <Button
                  busy={accept.isPending}
                  label={
                    preview.data.kind === "group"
                      ? "Join the group"
                      : preview.data.kind === "profile"
                        ? "Send friend request"
                        : "Accept the invite"
                  }
                  onPress={() => accept.mutate()}
                />
                {accept.isError ? (
                  <Text style={styles.error}>{errorMessage(accept.error)}</Text>
                ) : null}
              </>
              )
            ) : viewer.isLoading ? (
              <Spinner />
            ) : (
              <>
                <Button label="Sign in to accept" onPress={() => void signInFirst()} />
                <Text style={styles.hint}>
                  New here? Signing in with Google creates your account, then this invite
                  completes itself.
                </Text>
              </>
            )}
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    margin: spacing.lg,
    padding: spacing.lg,
  },
  error: {
    color: colors.brand600,
    fontSize: 13,
    fontWeight: "600",
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  requested: {
    color: colors.brand700,
    fontSize: 14,
    fontWeight: "600",
  },
  screen: {
    backgroundColor: colors.paper,
    flex: 1,
    justifyContent: "center",
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "700",
  },
});

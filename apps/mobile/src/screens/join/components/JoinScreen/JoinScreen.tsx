/** Deep-link landing for invite links: who invited you, to what, one tap in. */

import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { useJoinAPI } from "./hooks/useJoinAPI";
import { FOCUSED_CONTENT_MAX_WIDTH } from "@/lib/layout/constants/layout";
import {
  inviteCopy,
  INVITE_EXPIRED_BODY,
  INVITE_EXPIRED_TITLE,
  INVITE_INACTIVE_TITLE,
  INVITE_SIGN_IN_HINT,
} from "@haalkhata/shared/invite/inviteCopy";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the join screen a universal link opens. Preview needs no session;
 * accepting does — a signed-out person's token is stashed and the login flow
 * returns here to accept once a session exists.
 *
 * @param props - The token from the universal link.
 * @returns The invite landing content.
 */
export function JoinScreen({ token }: { token: string }) {
  const router = useRouter();
  const { preview, viewer, viewerStatus, accept, requestSent, signIn, expired } = useJoinAPI(token);
  const copy = preview.data ? inviteCopy(preview.data) : null;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
        {preview.isLoading ? (
          <Spinner />
        ) : preview.isError ? (
          <>
            <Text style={styles.title}>{expired ? INVITE_EXPIRED_TITLE : INVITE_INACTIVE_TITLE}</Text>
            <Text style={styles.body}>{expired ? INVITE_EXPIRED_BODY : errorMessage(preview.error)}</Text>
            <Button label="Open HaalKhata" onPress={() => router.replace("/")} />
          </>
        ) : preview.data ? (
          <>
            <Text style={styles.title}>
              {copy?.title}
            </Text>
            <Text style={styles.body}>
              {copy?.description}
            </Text>
            {viewerStatus === "signedIn" ? (
              requestSent ? (
                <Text style={styles.requested}>
                  {copy?.requestSent}
                </Text>
              ) : (
              <>
                <Button
                  busy={accept.isPending}
                  label={copy?.action ?? "Accept the invite"}
                  onPress={() => accept.mutate()}
                />
                {accept.isError ? (
                  <Text style={styles.error}>{errorMessage(accept.error)}</Text>
                ) : null}
              </>
              )
            ) : viewerStatus === "checking" ? (
              <Spinner />
            ) : viewerStatus === "failed" ? (
              // Signed in, but who as could not be read: offering a sign-in
              // here would send a signed-in person to sign in again.
              <>
                <Text accessibilityRole="alert" style={styles.error}>{errorMessage(viewer.error)}</Text>
                <Button
                  busy={viewer.isFetching}
                  label="Try again"
                  onPress={() => void viewer.refetch()}
                  variant="outline"
                />
              </>
            ) : (
              <>
                <Button busy={signIn.isPending} label="Sign in to accept" onPress={() => signIn.mutate()} />
                {signIn.isError ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage(signIn.error)}</Text> : null}
                <Text style={styles.hint}>
                  {INVITE_SIGN_IN_HINT}
                </Text>
              </>
            )}
            {viewerStatus === "signedIn" && viewer.data ? (
              <>
                <Text style={styles.hint}>Signed in as {viewer.data.name}.</Text>
                <Button label="Not now" variant="outline" onPress={() => router.replace("/dashboard")} />
              </>
            ) : null}
          </>
        ) : null}
        </View>
      </ScrollView>
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
    alignSelf: "center",
    width: "100%",
    maxWidth: FOCUSED_CONTENT_MAX_WIDTH,
    padding: spacing.lg,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
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
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "700",
  },
});

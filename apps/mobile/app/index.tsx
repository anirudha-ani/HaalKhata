/** Landing route: waits for session hydration, then routes into the app or to login. */

import { Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSession } from "@/lib/api/session";
import { colors, fonts, spacing } from "@/lib/theme/theme";

/**
 * Decides where the app starts: shows the wordmark while the persisted
 * session is read from SecureStore, then redirects to the dashboard when a
 * token exists or to the login screen otherwise.
 *
 * @returns The launch placeholder or a redirect.
 */
export default function Index() {
  const session = useSession();
  if (!session.hydrated) {
    return (
      <View style={styles.container}>
        <Text style={styles.wordmark}>HAALKHATA</Text>
      </View>
    );
  }
  return <Redirect href={session.token ? "/dashboard" : "/login"} />;
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.paper,
    flex: 1,
    justifyContent: "center",
  },
  subtitle: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 4,
    marginTop: spacing.xs,
  },
  wordmark: {
    color: colors.brand600,
    fontFamily: fonts.display,
    fontSize: 48,
    fontWeight: "700",
  },
});

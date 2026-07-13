/** Landing route: placeholder wordmark until the auth gate arrives. */

import { StyleSheet, Text, View } from "react-native";

/**
 * Renders the HaalKhata wordmark as a placeholder landing screen.
 *
 * @returns The landing screen element.
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.wordmark}>হালখাতা</Text>
      <Text style={styles.subtitle}>HAALKHATA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#faf6ef",
    flex: 1,
    justifyContent: "center",
  },
  subtitle: {
    color: "#857a68",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 4,
    marginTop: 4,
  },
  wordmark: {
    color: "#b03a25",
    fontSize: 48,
    fontWeight: "700",
  },
});

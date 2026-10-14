/** The floating brand-colored add-expense button in the middle of the tab bar. */

import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, radii } from "@/lib/theme/theme";

/**
 * Renders the raised circular add button between the tab items — the mobile
 * counterpart of the web bottom-nav's floating action button. Tapping it
 * pushes the new-expense screen instead of switching tabs.
 *
 * @returns The centered floating action button.
 */
export function AddExpenseTabButton() {
  const router = useRouter();
  return (
    <View style={styles.slot}>
      <Pressable
        accessibilityLabel="Add expense"
        accessibilityRole="button"
        onPress={() => router.push("/expenses/new")}
        style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
      >
        <Plus color={colors.white} size={26} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: colors.brand600,
    borderRadius: radii.full,
    boxShadow: "0 4px 8px rgba(176, 58, 37, 0.3)",
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  pressed: {
    opacity: 0.85,
  },
  slot: {
    alignItems: "center",
    flex: 1,
    marginTop: -20,
  },
});

/** Caller-owned block list and explicit unblock actions. */

import { View, StyleSheet } from "react-native";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/api/connect";
import { colors, spacing } from "@/lib/theme/theme";
import { useSafetyAPI } from "./hooks/useSafetyAPI";

/**
 * Shows blocked accounts without hiding a failed request behind an empty list.
 * @returns Account safety settings.
 */
export function BlockedPeople() {
  const safety = useSafetyAPI();
  return <View style={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Blocked people</Text>
    {safety.blocks.isPending ? <Text style={styles.text}>Loading…</Text> : safety.blocks.error ? <>
      <Text accessibilityRole="alert" style={styles.text}>{errorMessage(safety.blocks.error)}</Text>
      <Button variant="outline" label="Retry" onPress={() => { void safety.blocks.refetch(); }} />
    </> : safety.blocks.data?.users.length ? safety.blocks.data.users.map((person) => <View key={person.id} style={styles.row}>
      <Text style={styles.text}>{person.name}</Text><Button compact label="Unblock" variant="outline" busy={safety.unblock.isPending}
        onPress={() => safety.unblock.mutate(person.id)} />
    </View>) : <Text style={styles.text}>You have not blocked anyone.</Text>}
    {safety.unblock.error ? <Text accessibilityRole="alert" style={styles.text}>{errorMessage(safety.unblock.error)}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ content: { gap: spacing.sm }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" },
  text: { color: colors.inkSoft, fontSize: 13, lineHeight: 19, flexShrink: 1 }, title: { color: colors.ink, fontSize: 16, fontWeight: "600" } });

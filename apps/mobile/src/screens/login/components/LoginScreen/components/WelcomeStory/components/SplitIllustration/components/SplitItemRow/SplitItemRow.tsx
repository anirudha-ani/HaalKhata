/** One item on the sample bill, with the people who shared it popping on in turn. */

import { StyleSheet, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";
import type { SamplePerson } from "@/screens/login/constants/welcome";
import { AssignedAvatar } from "./components/AssignedAvatar/AssignedAvatar";

/**
 * Renders the item's name and price and, on the right, the avatars of
 * everyone who had it. The row brightens when its turn comes in the loop.
 *
 * @param props - Component props.
 * @returns The item row.
 */
export function SplitItemRow({
  label,
  amount,
  people,
  cycle,
  assignAt,
}: {
  label: string;
  amount: string;
  /** Who shared the item. */
  people: readonly SamplePerson[];
  /** The illustration's looping clock. */
  cycle: SharedValue<number>;
  /** Clock value at which this item is assigned. */
  assignAt: number;
}) {
  const rowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [assignAt - 0.04, assignAt, 0.92, 1], [0.45, 1, 1, 0.45], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={[styles.row, rowStyle]}>
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.label}>{label}</Text>
        <Text style={styles.amount}>{amount}</Text>
      </View>
      <View style={styles.people}>
        {people.map((person, index) => (
          <AssignedAvatar appearAt={assignAt + index * 0.03} cycle={cycle} key={person.id}>
            <Avatar ring size="sm" user={person} />
          </AssignedAvatar>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  amount: { color: colors.inkSoft, fontSize: 11, fontVariant: ["tabular-nums"] },
  label: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  people: { flexDirection: "row", marginLeft: spacing.sm },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  text: { flexShrink: 1, gap: 1 },
});

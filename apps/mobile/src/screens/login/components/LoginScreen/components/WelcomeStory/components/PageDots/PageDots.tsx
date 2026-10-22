/** The pager's page control: dots that follow the swipe, tappable, and adjustable with VoiceOver. */

import { StyleSheet, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { spacing } from "@/lib/theme/theme";
import { PageDot } from "./components/PageDot/PageDot";

/**
 * Renders one dot per page. The current dot stretches into a pill as its page
 * comes into view, driven by the live scroll offset. For VoiceOver the row
 * is a single adjustable control ("Step 2 of 3"; swipe up or down to move),
 * like iOS's own page control.
 *
 * @param props - Component props.
 * @returns The dot row.
 */
export function PageDots({
  count,
  page,
  pageWidth,
  scrollX,
  onSelect,
}: {
  count: number;
  /** The settled page. */
  page: number;
  pageWidth: number;
  /** The pager's live scroll offset. */
  scrollX: SharedValue<number>;
  /** Called with the page to show. */
  onSelect: (index: number) => void;
}) {
  return (
    <View
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      accessibilityLabel="Step"
      accessibilityRole="adjustable"
      accessibilityValue={{ text: `${page + 1} of ${count}` }}
      accessible
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") onSelect(page + 1);
        if (event.nativeEvent.actionName === "decrement") onSelect(page - 1);
      }}
      style={styles.row}
    >
      {Array.from({ length: count }, (_unused, index) => (
        <PageDot index={index} key={index} onPress={() => onSelect(index)} pageWidth={pageWidth} scrollX={scrollX} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center" },
});

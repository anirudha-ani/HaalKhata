/** Paged-list footer: the Show more button, why the last page did not load, or the end of the list. */

import { ChevronDown, ChevronUp } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders what sits beside a paged list's rows. A failed page is said just
 * above the button, which is the way to ask for it again, and the rows
 * already loaded stay where they are; a notice (a list that was read again
 * while it was being paged) sits in the same place. Once there is nothing
 * further, an optional line says the end was reached.
 *
 * @param props - The list's paging state and wording.
 * @returns The footer, or nothing when there is no more to load and no end line.
 */
export function ShowMoreFooter({
  hasMore,
  isLoadingMore,
  onShowMore,
  error = "",
  notice = "",
  label = "Show me more",
  endLine = "",
  direction = "older",
}: {
  /** Whether another page can be asked for. */
  hasMore: boolean;
  /** True while that page is being read. */
  isLoadingMore: boolean;
  /** Asks for the next page. */
  onShowMore: () => void;
  /** Why the last page did not load; "" when it did. */
  error?: string;
  /** Something to say about the list itself, beside the button; "" for nothing. */
  notice?: string;
  /** The button's words. */
  label?: string;
  /** Said once the whole list is loaded; "" for nothing. */
  endLine?: string;
  /** Which way the next page lies: below the rows ("older") or above them ("earlier"). */
  direction?: "older" | "earlier";
}) {
  if (!hasMore) {
    return endLine || notice ? (
      <View style={styles.footer}>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {endLine ? <Text style={styles.end}>{endLine}</Text> : null}
      </View>
    ) : null;
  }

  const Chevron = direction === "earlier" ? ChevronUp : ChevronDown;
  return (
    <View style={styles.footer}>
      {notice ? (
        <Text accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      {error ? <ErrorAlert message={`Couldn't load more: ${error}`} /> : null}
      <Button
        busy={isLoadingMore}
        icon={<Chevron color={colors.inkSoft} size={16} />}
        label={label}
        onPress={onShowMore}
        variant="outline"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  end: {
    color: colors.inkSoft,
    fontSize: 12,
    textAlign: "center",
  },
  footer: {
    gap: spacing.md,
  },
  notice: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
    borderRadius: radii.lg,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    padding: spacing.lg,
  },
});

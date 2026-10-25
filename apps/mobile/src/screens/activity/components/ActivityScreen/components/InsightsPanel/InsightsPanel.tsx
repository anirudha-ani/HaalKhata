/** Insights panel: the person's own dashboard, drawn from the same history as the feed. */

import { RotateCw } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Segmented } from "@/components/ui/Segmented";
import { Spinner } from "@/components/ui/Spinner";
import { INSIGHT_RANGES } from "@haalkhata/shared/analytics/insights";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { useInsights } from "../../hooks/useInsights";
import { CategoriesCard } from "./components/CategoriesCard/CategoriesCard";
import { CompanionsCard } from "./components/CompanionsCard/CompanionsCard";
import { JourneyCard } from "./components/JourneyCard/JourneyCard";
import { PlacesCard } from "./components/PlacesCard/PlacesCard";
import { SpendingCard } from "./components/SpendingCard/SpendingCard";
import { SplitTypesCard } from "./components/SplitTypesCard/SplitTypesCard";

/**
 * Renders the insights dashboard: lifetime figures, then one row of filters
 * and everything they scope (spending by month, by category, with whom,
 * where, and how it was split).
 *
 * The filters sit together above the charts they change and nowhere else,
 * so every number below them is always about the same period and the same
 * currency. The lifetime card is above them because the period does not
 * touch it. On a tablet the smaller cards pair up two to a row.
 *
 * A failure is stated here, in the panel, with a way to try again: a toast
 * would vanish and leave an empty view with no explanation. The period
 * control is drawn whatever state the data is in, because it is the way out
 * of a period that failed to load.
 *
 * @returns The panel.
 */
export function InsightsPanel({
  state,
}: {
  /** The dashboard's data and controls, from the screen's `useInsights`. */
  state: ReturnType<typeof useInsights>;
}) {
  const { isTablet } = useResponsiveLayout();
  const half = isTablet ? styles.half : null;

  return (
    <View style={styles.panel}>
      {state.error ? (
        <View accessibilityRole="alert" style={styles.error}>
          <Text style={styles.errorText}>Couldn&apos;t load your insights: {state.error}</Text>
          <Button
            compact
            icon={<RotateCw color={colors.inkSoft} size={14} />}
            label="Try again"
            onPress={state.refresh}
            variant="outline"
          />
        </View>
      ) : null}

      {state.insights?.journey ? <JourneyCard journey={state.insights.journey} /> : null}

      <View style={styles.filters}>
        <Segmented onChange={state.setRange} options={INSIGHT_RANGES} value={state.range} />
        {state.currencies.length > 1 ? (
          <View style={styles.currencies}>
            {state.currencies.map((block) => (
              <Chip
                key={block.currency}
                label={block.currency}
                onPress={() => state.setCurrency(block.currency)}
                selected={state.currencyBlock?.currency === block.currency}
              />
            ))}
          </View>
        ) : null}
      </View>

      {state.isLoading ? (
        <Spinner label="Adding it all up…" />
      ) : state.insights ? (
        // While another period loads, the previous one stays, dimmed: no
        // spinner, no jump in the screen's height.
        <View
          accessibilityState={{ busy: state.isSwitching }}
          style={[styles.cards, state.isSwitching ? styles.cardsSwitching : null]}
        >
          <SpendingCard
            activeMonth={state.activeMonth}
            block={state.currencyBlock}
            months={state.insights.months}
            onActivateMonth={state.setActiveMonth}
            style={styles.full}
          />
          <CategoriesCard block={state.currencyBlock} style={half ?? styles.full} />
          <CompanionsCard
            companions={state.currencyBlock?.companions ?? []}
            style={half ?? styles.full}
          />
          <PlacesCard groups={state.currencyBlock?.groups ?? []} style={half ?? styles.full} />
          <SplitTypesCard
            splitTypes={state.currencyBlock?.splitTypes ?? []}
            style={half ?? styles.full}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cards: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  cardsSwitching: {
    opacity: 0.6,
  },
  currencies: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  error: {
    backgroundColor: colors.neg50,
    borderColor: colors.neg600,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorText: {
    color: colors.neg700,
    fontSize: 14,
    fontWeight: "500",
  },
  filters: {
    gap: spacing.md,
  },
  full: {
    width: "100%",
  },
  // Two to a row: the basis leaves room for the gap between the pair, and
  // growing closes whatever is left.
  half: {
    flexBasis: "45%",
    flexGrow: 1,
  },
  panel: {
    gap: spacing.lg,
  },
});

/** Column chart: one series of values over an ordered axis, with a selectable column. */

import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { barFraction, showsAxisLabel } from "@haalkhata/shared/analytics/chart";
import { colors } from "@/lib/theme/theme";
import {
  COLUMN_PLOT_HEIGHT,
  MAXIMUM_AXIS_LABELS,
  MAXIMUM_COLUMN_WIDTH,
  MINIMUM_COLUMN_PERCENT,
  VALUE_AXIS_WIDTH,
} from "./charts.constants";

/** One column of the chart. */
export interface ChartColumn {
  /** Stable identity, e.g. a "YYYY-MM" month key. */
  key: string;
  /** Short text under the column, e.g. "Oct". */
  axisLabel: string;
  /** Full name, for the accessible name, e.g. "October 2026". */
  name: string;
  /** The value plotted. */
  value: number;
  /** The value as a person reads it, e.g. "$412.00". */
  valueLabel: string;
}

/**
 * Renders one series as columns growing from a shared baseline.
 *
 * One colour for every column: the columns are one series, and a second
 * colour would claim a difference that is not in the data. The darker
 * column is the selected one, whose value the caller shows in words. A
 * column is selected by tapping anywhere in its slot, not just on the
 * painted bar, so a short month is as easy to hit as a tall one.
 *
 * No value is reachable only by touching a bar: the caller writes the
 * selected value out, and every column announces its own name and value to
 * a screen reader.
 */
export function ColumnChart({
  columns,
  ceiling,
  formatTick,
  activeKey,
  onActivate,
  description,
}: {
  /** The columns, oldest (leftmost) first. */
  columns: readonly ChartColumn[];
  /** What the value axis ends on; at or above the largest value. */
  ceiling: number;
  /** Spells an axis value for its gridline label. */
  formatTick: (value: number) => string;
  /** Key of the selected column. */
  activeKey: string;
  /** Called with a column's key when it is tapped. */
  onActivate: (key: string) => void;
  /** What the chart shows, for assistive technology. */
  description: string;
}) {
  return (
    <View accessibilityLabel={description}>
      <View style={styles.chart}>
        {/* Value axis: the halfway and top gridlines are labelled; the
            baseline is zero and says so by being the baseline. */}
        <View style={styles.valueAxis}>
          <Text numberOfLines={1} style={[styles.tick, styles.tickTop]}>
            {formatTick(ceiling)}
          </Text>
          <Text numberOfLines={1} style={[styles.tick, styles.tickMiddle]}>
            {formatTick(ceiling / 2)}
          </Text>
        </View>

        <View style={styles.plot}>
          <View style={[styles.gridline, styles.gridlineTop]} />
          <View style={[styles.gridline, styles.gridlineMiddle]} />
          <View style={styles.columns}>
            {columns.map((column) => {
              const active = column.key === activeKey;
              const percent = barFraction(column.value, ceiling) * 100;
              return (
                <Pressable
                  accessibilityLabel={`${column.name}: ${column.valueLabel}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={column.key}
                  onPress={() => onActivate(column.key)}
                  style={styles.slot}
                >
                  {column.value > 0 ? (
                    <View
                      style={[
                        styles.bar,
                        active ? styles.barActive : null,
                        { height: `${Math.max(percent, MINIMUM_COLUMN_PERCENT)}%` },
                      ]}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.axisLabels}>
        {columns.map((column, index) => (
          <Text
            key={column.key}
            numberOfLines={1}
            style={[styles.axisLabel, column.key === activeKey ? styles.axisLabelActive : null]}
          >
            {showsAxisLabel(index, columns.length, MAXIMUM_AXIS_LABELS) ? column.axisLabel : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  axisLabel: {
    color: colors.inkSoft,
    flex: 1,
    fontSize: 10,
    textAlign: "center",
  },
  axisLabelActive: {
    color: colors.ink,
    fontWeight: "600",
  },
  axisLabels: {
    flexDirection: "row",
    marginLeft: VALUE_AXIS_WIDTH,
    paddingTop: 6,
  },
  bar: {
    backgroundColor: colors.brand500,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    maxWidth: MAXIMUM_COLUMN_WIDTH,
    width: "100%",
  },
  barActive: {
    backgroundColor: colors.brand700,
  },
  chart: {
    flexDirection: "row",
    // Room for the top tick label, which is centred on the top gridline.
    paddingTop: 6,
  },
  columns: {
    flexDirection: "row",
    height: "100%",
  },
  gridline: {
    backgroundColor: colors.line,
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
  },
  gridlineMiddle: {
    top: "50%",
  },
  gridlineTop: {
    top: 0,
  },
  plot: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flex: 1,
    height: COLUMN_PLOT_HEIGHT,
  },
  slot: {
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 2,
  },
  tick: {
    color: colors.inkSoft,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
    left: 0,
    position: "absolute",
    right: 6,
    textAlign: "right",
  },
  tickMiddle: {
    top: COLUMN_PLOT_HEIGHT / 2 - 6,
  },
  tickTop: {
    top: -6,
  },
  valueAxis: {
    height: COLUMN_PLOT_HEIGHT,
    width: VALUE_AXIS_WIDTH,
  },
});

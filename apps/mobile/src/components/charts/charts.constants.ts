/** Layout constants shared by the chart components. */

/** Height of a column chart's plot area, in density-independent pixels. */
export const COLUMN_PLOT_HEIGHT = 144;

/** Width reserved left of the plot for value-axis labels. */
export const VALUE_AXIS_WIDTH = 40;

/** Widest a column is drawn; the rest of its slot stays empty. */
export const MAXIMUM_COLUMN_WIDTH = 24;

/** Most axis labels drawn under the columns before they are thinned out. */
export const MAXIMUM_AXIS_LABELS = 6;

/**
 * Shortest a column with a value is drawn, as a percentage of the plot.
 * Without a floor a small month next to a large one rounds to nothing and
 * reads as "no spending", which is a different fact.
 */
export const MINIMUM_COLUMN_PERCENT = 2;

/** Thickness of a ranked list's bar. */
export const BAR_LIST_BAR_HEIGHT = 6;

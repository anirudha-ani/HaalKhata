/** Layout constants for the column chart. */

/** Most axis labels drawn under the columns before they are thinned out. */
export const MAXIMUM_AXIS_LABELS = 6;

/**
 * Shortest a column with a value is drawn, as a percentage of the plot.
 * Without a floor a small month next to a large one rounds to nothing and
 * reads as "no spending", which is a different fact.
 */
export const MINIMUM_COLUMN_PERCENT = 2;

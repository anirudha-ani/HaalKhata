/** Stroke and fill attributes shared by the hand-drawn activity glyphs. */

/**
 * Outline attributes. Round caps plus a heavy-ish stroke are what make these
 * read as drawn rather than as a stock icon set.
 */
export const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Lighter outline for facial features, so they sit inside the heavier body. */
export const FINE = { ...STROKE, strokeWidth: 1.4 } as const;

/** Filled variant — cannot spread STROKE, whose `fill: none` would win. */
export const SOLID = {
  fill: "currentColor",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinejoin: "round",
} as const;

/** Hand-drawn activity glyphs: one little face per feed event kind. */

import { BlankGlyph } from "./components/BlankGlyph/BlankGlyph";
import { GLYPHS } from "./constants/glyphs";

/** Every glyph this set can draw, keyed by the name an event look refers to. */
export type GlyphName =
  | "shockedReceipt"
  | "sideEye"
  | "skull"
  | "cashGrin"
  | "wingedCoin"
  | "buddies"
  | "partyHat"
  | "yapping"
  | "blank";

/**
 * Draws one activity glyph.
 *
 * Custom SVG rather than emoji: emoji are rendered by the OS, so the same feed
 * looks like three different apps across platforms, and their baked-in colours
 * fight the tinted tile they sit on. These inherit `currentColor`, so a glyph
 * is whatever colour its tile says it is.
 *
 * Nearly all of them are faces, and that is the point — an expression is the
 * only thing that reliably makes a 24px drawing funny. A tidy outline of the
 * object being described is perfectly legible and completely inert.
 *
 * Always `aria-hidden`: the tile that wraps it carries the accessible name, so
 * a screen reader hears "Expense deleted" rather than a description of a skull.
 *
 * @param props - Component props.
 * @returns The SVG glyph.
 */
export function ActivityGlyph({
  name,
  className = "h-6 w-6",
}: {
  /** Which glyph to draw. */
  name: GlyphName;
  /** Sizing/colour classes; colour flows into the strokes via currentColor. */
  className?: string;
}) {
  const Glyph = GLYPHS[name] ?? BlankGlyph;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <Glyph />
    </svg>
  );
}

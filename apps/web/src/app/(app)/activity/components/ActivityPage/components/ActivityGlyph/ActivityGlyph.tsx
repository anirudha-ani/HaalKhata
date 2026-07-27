/** Hand-drawn activity glyphs: one custom SVG per feed event kind. */

/** Every glyph this set can draw, keyed by the name an event look refers to. */
export type GlyphName =
  | "receipt"
  | "scribble"
  | "tombstone"
  | "moneyBag"
  | "cashWings"
  | "highFive"
  | "partyPopper"
  | "speechSquiggle"
  | "pin";

/**
 * Shared drawing attributes.
 *
 * Everything is stroked in `currentColor` so the tile's text colour drives the
 * glyph and one SVG serves every tint. Round caps and joins plus a slightly
 * heavy stroke are what make these read as drawn rather than as a corporate
 * icon set — the lines are deliberately a little off-square.
 */
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A three-point sparkle, reused wherever a glyph needs a bit of glint. */
function Sparkle({ x: originX, y: originY, size = 3 }: { x: number; y: number; size?: number }) {
  return (
    <path
      d={`M${originX} ${originY - size} Q${originX + size * 0.28} ${originY - size * 0.28} ${originX + size} ${originY}
          Q${originX + size * 0.28} ${originY + size * 0.28} ${originX} ${originY + size}
          Q${originX - size * 0.28} ${originY + size * 0.28} ${originX - size} ${originY}
          Q${originX - size * 0.28} ${originY - size * 0.28} ${originX} ${originY - size} Z`}
      fill="currentColor"
      stroke="none"
    />
  );
}

/** Receipt with a torn zigzag hem — a new expense landed. */
function ReceiptGlyph() {
  return (
    <>
      <path
        {...STROKE}
        d="M6.4 4.6c0-.6.5-1 1-1h8.8c.6 0 1 .5 1 1v13.2l-1.8-1.2-1.7 1.2-1.8-1.2-1.7 1.2-1.8-1.2-1.9 1.2z"
      />
      <path {...STROKE} d="M9 8h6M9 11h4.2" />
      <Sparkle x={18.6} y={5.6} size={2.1} />
    </>
  );
}

/** Pencil over a wobbly underline — something was edited. */
function ScribbleGlyph() {
  return (
    <>
      <path {...STROKE} d="M15.6 4.3l3.4 3.4-8.6 8.6-4.2.8.8-4.2z" />
      <path {...STROKE} d="M13.6 6.3l3.4 3.4" />
      <path {...STROKE} d="M4.6 19.6c1.5-1.1 3-1.1 4.5 0s3 1.1 4.5 0 3-1.1 4.5 0" />
    </>
  );
}

/** Headstone with grass — the expense is no longer with us. */
function TombstoneGlyph() {
  return (
    <>
      <path {...STROKE} d="M6.6 19.2V10a5.4 5.4 0 0 1 10.8 0v9.2z" />
      <path {...STROKE} d="M12 8.6v5M9.8 10.6h4.4" />
      <path {...STROKE} d="M3.6 19.4c.9 0 .9-1.4 1.8-1.4s.9 1.4 1.8 1.4" />
      <path {...STROKE} d="M16.8 19.4c.9 0 .9-1.4 1.8-1.4s.9 1.4 1.8 1.4" />
    </>
  );
}

/** Cinched money bag, mid-glint — the bag has been secured. */
function MoneyBagGlyph() {
  return (
    <>
      <path {...STROKE} d="M9.2 3.6h5.6l-1.5 2.4h-2.6z" />
      <path
        {...STROKE}
        d="M10.7 6c-2.6 1-4.9 3.9-4.9 7.4 0 4 2.6 6.6 6.2 6.6s6.2-2.6 6.2-6.6c0-3.5-2.3-6.4-4.9-7.4z"
      />
      <path {...STROKE} d="M12 10.2v6M13.7 11.4c-.4-.5-1-.7-1.7-.7-1 0-1.7.5-1.7 1.3s.7 1.1 1.7 1.3 1.7.6 1.7 1.4-.7 1.3-1.7 1.3c-.7 0-1.3-.2-1.7-.7" />
      <Sparkle x={18.4} y={6.4} size={2.2} />
      <Sparkle x={5.2} y={8.4} size={1.5} />
    </>
  );
}

/**
 * A banknote folded into a paper plane, mid-flight — money you sent.
 *
 * A winged note is the obvious metaphor and was tried first, but at 24px the
 * note fills the box and the wing collapses into an unreadable blob. A plane
 * carries "sent" at any size, and the row's caption and signed amount supply
 * the "money" half.
 */
function CashWingsGlyph() {
  return (
    <>
      <path {...STROKE} d="M21.4 3.6L9.6 20.8l-1.9-6.6z" />
      <path {...STROKE} d="M21.4 3.6L2.6 10.9l5.1 3.3z" />
      <path {...STROKE} d="M12.4 13.4l-1.5 3.4" />
      <path {...STROKE} d="M2.2 15.4h3.4M3.4 18.6h4" />
    </>
  );
}

/** Two mismatched hands meeting — somebody joined. */
function HighFiveGlyph() {
  return (
    <>
      <path {...STROKE} d="M10.6 12.4V6.2a1.3 1.3 0 0 1 2.6 0v5" />
      <path {...STROKE} d="M8.1 13.2V8.4a1.3 1.3 0 0 1 2.5 0v4" />
      <path
        {...STROKE}
        d="M8.1 11.2c-1.5.3-2.3 1.4-2 2.9l.7 3.2c.4 1.8 1.9 3 3.8 3h2.1c2.2 0 3.9-1.7 3.9-3.9v-4.3a1.3 1.3 0 0 0-2.6 0"
      />
      <path {...STROKE} d="M17.8 6.2l1.6-1.4M19.4 9.4l2-.4" />
    </>
  );
}

/** Party popper mid-burst — a group exists now, and that is an event. */
function PartyPopperGlyph() {
  return (
    <>
      <path {...STROKE} d="M3.4 20.6l5.2-11.4 6.2 6.2z" />
      <path {...STROKE} d="M8.6 9.2l6.2 6.2" />
      <path {...STROKE} d="M13.6 8.2c.9-1.5 2.4-1.9 3.6-1.1" />
      <path {...STROKE} d="M15.8 11.6c1.6-.7 3.2-.1 3.8 1.3" />
      <circle cx="18.4" cy="4.4" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="21.2" cy="9.4" r=".9" fill="currentColor" stroke="none" />
      <circle cx="13.4" cy="3.2" r=".8" fill="currentColor" stroke="none" />
      <Sparkle x={21} y={4.2} size={1.6} />
    </>
  );
}

/** Speech bubble with a squiggle where the words would be. */
function SpeechSquiggleGlyph() {
  return (
    <>
      <path
        {...STROKE}
        d="M4.6 10.4c0-3.2 3.3-5.6 7.4-5.6s7.4 2.4 7.4 5.6-3.3 5.6-7.4 5.6a10 10 0 0 1-2.3-.3l-4 2.3.9-3.4a5.4 5.4 0 0 1-2-4.2z"
      />
      <path {...STROKE} d="M8.2 10.4c.8-.8 1.6-.8 2.4 0s1.6.8 2.4 0 1.6-.8 2.4 0" />
    </>
  );
}

/** Fallback: a slightly crooked pin for an event kind this build predates. */
function PinGlyph() {
  return (
    <>
      <path {...STROKE} d="M12 21.2v-6.4" />
      <path {...STROKE} d="M8.2 5.2h7.6l-1 4.2 2.2 3.2a1 1 0 0 1-.8 1.6H7.8a1 1 0 0 1-.8-1.6l2.2-3.2z" />
      <path {...STROKE} d="M9.4 3.2h5.2" />
    </>
  );
}

/** Every glyph, keyed by name. */
const GLYPHS: Record<GlyphName, () => React.JSX.Element> = {
  receipt: ReceiptGlyph,
  scribble: ScribbleGlyph,
  tombstone: TombstoneGlyph,
  moneyBag: MoneyBagGlyph,
  cashWings: CashWingsGlyph,
  highFive: HighFiveGlyph,
  partyPopper: PartyPopperGlyph,
  speechSquiggle: SpeechSquiggleGlyph,
  pin: PinGlyph,
};

/**
 * Draws one activity glyph.
 *
 * Custom SVG rather than emoji: emoji are rendered by the OS, so the same feed
 * looks like three different apps across Apple, Android and Windows, none of
 * them matching this one's line weight — and their colours fight the tile tint
 * they sit on. These inherit `currentColor`, so a glyph is whatever colour its
 * tile says it is.
 *
 * Always `aria-hidden`: the tile that wraps it carries the accessible name, so
 * a screen reader hears "Expense deleted" rather than a description of a
 * headstone.
 *
 * @param props - Component props.
 * @returns The SVG glyph.
 */
export function ActivityGlyph({
  name,
  className = "h-5 w-5",
}: {
  /** Which glyph to draw. */
  name: GlyphName;
  /** Sizing/colour classes; colour flows into the strokes via currentColor. */
  className?: string;
}) {
  const Glyph = GLYPHS[name] ?? PinGlyph;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <Glyph />
    </svg>
  );
}

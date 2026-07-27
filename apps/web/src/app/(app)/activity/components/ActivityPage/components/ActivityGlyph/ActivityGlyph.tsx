/** Hand-drawn activity glyphs: one little face per feed event kind. */

/** Every glyph this set can draw, keyed by the name an event look refers to. */
export type GlyphName =
  | "shockedReceipt"
  | "sideEye"
  | "skull"
  | "cashGrin"
  | "wingedCash"
  | "buddies"
  | "partyHat"
  | "yapping"
  | "blank";

/**
 * Outline attributes. Round caps plus a heavy-ish stroke are what make these
 * read as drawn rather than as a stock icon set.
 */
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Lighter outline for facial features, so they sit inside the heavier body. */
const FINE = { ...STROKE, strokeWidth: 1.4 } as const;

/** Filled variant — cannot spread STROKE, whose `fill: none` would win. */
const SOLID = {
  fill: "currentColor",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinejoin: "round",
} as const;

/** A filled eye dot. */
function EyeDot({ x: eyeX, y: eyeY, r: radius = 1 }: { x: number; y: number; r?: number }) {
  return <circle cx={eyeX} cy={eyeY} r={radius} fill="currentColor" />;
}

/**
 * A "$" sized to survive the real render.
 *
 * These are used as eyes, not as floating decoration beside the face. Two
 * 3.6-unit signs parked in the corners at 20px came out as illegible specks;
 * the same mark centred in an eye socket reads, because it is what the eye is.
 *
 * @param props - Centre point and scale of the sign.
 * @returns The dollar sign.
 */
function Dollar({ x: originX, y: originY, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${originX} ${originY}) scale(${scale})`}>
      <path {...FINE} d="M0 -3v6" />
      <path {...FINE} d="M-1.7 -1.3c.5-1 2.9-1 3.4 0s-2.9 1.5-3.4 2.6 1.7 1.6 3.4.9" />
    </g>
  );
}

/** A receipt caught mid-scream — a new expense just landed. */
function ShockedReceiptGlyph() {
  return (
    <>
      <path
        {...STROKE}
        d="M5.4 4.4c0-.6.5-1 1-1h11.2c.6 0 1 .5 1 1v14.4l-1.9-1.3-1.8 1.3-1.9-1.3-1.8 1.3-1.9-1.3-2 1.3z"
      />
      <EyeDot x={9.4} y={8.4} r={1.25} />
      <EyeDot x={14.6} y={8.4} r={1.25} />
      <ellipse {...FINE} cx="12" cy="13.4" rx="2.6" ry="3.1" />
    </>
  );
}

/** Hard side-eye with a raised brow — somebody edited an expense. */
function SideEyeGlyph() {
  return (
    <>
      <circle {...STROKE} cx="12" cy="12" r="8" />
      <circle {...FINE} cx="9.3" cy="10.6" r="2" />
      <circle {...FINE} cx="15" cy="10.6" r="2" />
      {/* Pupils jammed to the outer edge; that offset is the whole joke. */}
      <EyeDot x={10.6} y={10.6} />
      <EyeDot x={16.3} y={10.6} />
      <path {...STROKE} d="M6.9 6.9c.9-.7 2-.8 2.9-.3" />
      <path {...FINE} d="M9 16c1.4-.7 2.6-.7 3.4-.2s1.6.5 2.4-.2" />
    </>
  );
}

/** A skull with X'd-out eyes — the expense is gone. */
function SkullGlyph() {
  return (
    <>
      <path
        {...STROKE}
        d="M12 3.2c-4.5 0-7.5 2.9-7.5 6.8 0 2.1 1 3.6 2.1 4.4.5.4.8 1 .8 1.6v1.2c0 .8.6 1.4 1.4 1.4h6.4c.8 0 1.4-.6 1.4-1.4V16c0-.6.3-1.2.8-1.6 1.1-.8 2.1-2.3 2.1-4.4 0-3.9-3-6.8-7.5-6.8z"
      />
      <path {...STROKE} d="M7.8 8.8l2.2 2.2M10 8.8l-2.2 2.2M14 8.8l2.2 2.2M16.2 8.8L14 11" />
      <path {...FINE} d="M10 18.6v2.2M12 18.6v2.2M14 18.6v2.2" />
    </>
  );
}

/** Dollar-sign eyes over a huge grin — you got paid. */
function CashGrinGlyph() {
  return (
    <>
      <circle {...STROKE} cx="12" cy="12" r="8.4" />
      <Dollar x={8.6} y={10} scale={0.85} />
      <Dollar x={15.4} y={10} scale={0.85} />
      <path {...SOLID} d="M7.4 14.6c.7 2.4 2.4 3.7 4.6 3.7s3.9-1.3 4.6-3.7z" />
    </>
  );
}

/**
 * A banknote with wings, mid-getaway — you paid somebody.
 *
 * This is what 💸 always depicted; the original sin was showing it for money
 * *received*, where it said the opposite of what happened. Direction is
 * resolved per viewer now, so it can only land on a payment you made.
 *
 * Wings are horizontal, filled, and attached at the note's mid-height. Every
 * upright variant — lobes above the top corners, however pointed or notched —
 * read unmistakably as bunny ears: two vertical shapes flanking a rectangle is
 * a face with ears, and no amount of feather detail overrides that at 24px.
 * Swept back and level, the same shapes read as flight. Filled rather than
 * outlined because thin strokes disappear at this size.
 */
function WingedCashGlyph() {
  return (
    <>
      <path
        {...SOLID}
        d="M7.2 10.8C4.4 9.6 1.4 10.4.8 12c-.4 1.1 1 1.6 2.4 1.5-.6.8.4 1.6 1.8 1.4 1.3-.2 2.3-1 2.4-1.9z"
      />
      <path
        {...SOLID}
        d="M16.8 10.8c2.8-1.2 5.8-.4 6.4 1.2.4 1.1-1 1.6-2.4 1.5.6.8-.4 1.6-1.8 1.4-1.3-.2-2.3-1-2.4-1.9z"
      />
      <rect {...STROKE} x="6.8" y="8.6" width="10.4" height="7" rx="1.5" />
      {/* A "$" rather than the usual portrait oval: this tile is neutral, so
          the glyph has to say "money" without help from the tint. */}
      <path {...FINE} d="M12 9.7v4.8" />
      <path {...FINE} d="M10.5 10.8c.5-.8 2.6-.8 3.1 0s-2.6 1.2-3.1 2 1.5 1.3 3.1.7" />
    </>
  );
}

/** Two faces, the newcomer winking — somebody joined. */
function BuddiesGlyph() {
  return (
    <>
      <circle {...STROKE} cx="15.4" cy="10.4" r="5" />
      {/* One eye a closed line: the wink. */}
      <path {...FINE} d="M13.6 9.6h1.4" />
      <EyeDot x={17.4} y={9.4} r={0.9} />
      <path {...FINE} d="M13.9 12.4c.9.9 2.1.9 3 0" />
      <circle {...STROKE} cx="8.6" cy="14" r="5.4" />
      <EyeDot x={7} y={13.2} r={0.95} />
      <EyeDot x={10.2} y={13.2} r={0.95} />
      <path {...FINE} d="M6.8 16.2c1 1 2.6 1 3.6 0" />
    </>
  );
}

/** Party hat and confetti — a group now exists, and that is an occasion. */
function PartyHatGlyph() {
  return (
    <>
      <circle {...STROKE} cx="12" cy="14.6" r="6.4" />
      <path {...STROKE} d="M12 2.6l3.6 5.6H8.4z" />
      <EyeDot x={9.9} y={13.6} />
      <EyeDot x={14.1} y={13.6} />
      <path {...SOLID} d="M8.9 16.4c.6 1.7 1.7 2.6 3.1 2.6s2.5-.9 3.1-2.6z" />
      <EyeDot x={3.6} y={6.4} r={0.9} />
      <EyeDot x={20.4} y={6.4} r={0.9} />
      <EyeDot x={4.8} y={11} r={0.7} />
      <EyeDot x={19.4} y={11.4} r={0.7} />
    </>
  );
}

/** A speech bubble mid-yap. */
function YappingGlyph() {
  return (
    <>
      <path
        {...STROKE}
        d="M4.2 10.2c0-3.3 3.5-5.8 7.8-5.8s7.8 2.5 7.8 5.8-3.5 5.8-7.8 5.8a11 11 0 0 1-2.4-.3l-4.2 2.4 1-3.5a5.6 5.6 0 0 1-2.2-4.4z"
      />
      <EyeDot x={9.4} y={8.8} r={0.9} />
      <EyeDot x={14.6} y={8.8} r={0.9} />
      <ellipse {...SOLID} cx="12" cy="12.2" rx="2.4" ry="1.7" />
    </>
  );
}

/** Fallback: a blank stare, for an event kind this build predates. */
function BlankGlyph() {
  return (
    <>
      <circle {...STROKE} cx="12" cy="12" r="8" />
      <EyeDot x={9.4} y={10.4} r={0.95} />
      <EyeDot x={14.6} y={10.4} r={0.95} />
      <path {...STROKE} d="M9.2 15.4h5.6" />
    </>
  );
}

/** Every glyph, keyed by name. */
const GLYPHS: Record<GlyphName, () => React.JSX.Element> = {
  shockedReceipt: ShockedReceiptGlyph,
  sideEye: SideEyeGlyph,
  skull: SkullGlyph,
  cashGrin: CashGrinGlyph,
  wingedCash: WingedCashGlyph,
  buddies: BuddiesGlyph,
  partyHat: PartyHatGlyph,
  yapping: YappingGlyph,
  blank: BlankGlyph,
};

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

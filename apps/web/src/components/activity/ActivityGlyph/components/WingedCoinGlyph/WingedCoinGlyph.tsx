/** Activity glyph for a payment made: a winged coin. */

import { STROKE, FINE } from "../../constants/strokes";

/**
 * A winged coin, snitch-style — you paid somebody.
 *
 * This is what 💸 always depicted; the original sin was showing it for money
 * *received*, where it said the opposite of what happened. Direction is
 * resolved per viewer now, so it can only land on a payment you made.
 *
 * A coin rather than a banknote, after roughly thirty rendered variants of the
 * note failed. The note is a rectangle, and a rectangle with wings has no good
 * answer at 24px: wings above its corners read as bunny ears, wings at its
 * sides read as a bowtie, and a diagonal composition needs detail the size
 * cannot hold. A coin is a circle — the same base shape as every other glyph
 * here — so it sits in the column instead of fighting it, and the winged-sphere
 * silhouette is legible at any size because the outline alone carries it.
 *
 * The coin is r6 — close to the r7.8-8.4 circles the faces around it use, so
 * it carries the same visual weight in the column rather than looking like a
 * smaller sibling. The "$" is proportioned to it (0.63r tall, 0.39r wide);
 * scaling the sign independently of the coin overflows the rim.
 */
export function WingedCoinGlyph() {
  return (
    <>
      <circle {...STROKE} cx="12" cy="12" r="6" />
      <path {...FINE} d="M12 8.22v7.56" />
      <path
        {...FINE}
        d="M14.34 10.11c-0.66-1.06 -4.02-1.06 -4.68 0s4.02 1.55 4.68 2.72-2.34 1.81 -4.68 0.91"
      />
      {/* Three lobes fanning off a swept leading edge. The lobes are cut into
          the outline rather than drawn as interior feather lines: an internal
          stroke is the first thing to disappear at 24px, whereas a notched
          silhouette keeps its structure all the way down. */}
      <path
        {...STROKE}
        d="M6.8 9.6C5.6 5.8 3 2 1.4 3c-1 .6-.5 2.6.9 4.3-1.4.1-1.5 1.8.1 2.7-1 .6-.3 1.9 1.4 2 1.2.1 2.3-.6 3-2.4z"
      />
      <path
        {...STROKE}
        d="M17.2 9.6c1.2-3.8 3.8-7.6 5.4-6.6 1 .6.5 2.6-.9 4.3 1.4.1 1.5 1.8-.1 2.7 1 .6.3 1.9-1.4 2-1.2.1-2.3-.6-3-2.4z"
      />
    </>
  );
}

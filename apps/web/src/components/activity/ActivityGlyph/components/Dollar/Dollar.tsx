/** Dollar: the dollar sign the activity glyphs use as eyes. */

import { FINE } from "../../constants/strokes";

/**
 * A "$" sized to survive the real render.
 *
 * The S starts at the top *right* and sweeps left. Drawing it left-to-right —
 * which is the intuitive way to write the path — produces a mirrored "Ƨ", and
 * at 24px that is subtle enough to ship twice before anyone catches it.
 *
 * These are used as eyes, not as floating decoration beside the face. Two
 * 3.6-unit signs parked in the corners at 20px came out as illegible specks;
 * the same mark centred in an eye socket reads, because it is what the eye is.
 *
 * @param props - Centre point and scale of the sign.
 * @returns The dollar sign.
 */
export function Dollar({ x: originX, y: originY, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${originX} ${originY}) scale(${scale})`}>
      <path {...FINE} d="M0 -3v6" />
      <path {...FINE} d="M1.7 -1.3c-.5-1-2.9-1-3.4 0s2.9 1.5 3.4 2.6-1.7 1.6-3.4.9" />
    </g>
  );
}

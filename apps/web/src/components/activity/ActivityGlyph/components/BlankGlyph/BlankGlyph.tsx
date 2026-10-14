/** Fallback activity glyph: a blank stare, for an event kind this build predates. */

import { STROKE } from "../../constants/strokes";
import { EyeDot } from "../EyeDot/EyeDot";

/** Fallback: a blank stare, for an event kind this build predates. */
export function BlankGlyph() {
  return (
    <>
      <circle {...STROKE} cx="12" cy="12" r="8" />
      <EyeDot x={9.4} y={10.4} r={0.95} />
      <EyeDot x={14.6} y={10.4} r={0.95} />
      <path {...STROKE} d="M9.2 15.4h5.6" />
    </>
  );
}

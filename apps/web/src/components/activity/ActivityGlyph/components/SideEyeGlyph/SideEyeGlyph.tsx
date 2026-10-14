/** Activity glyph for an edited expense: hard side-eye with a raised brow. */

import { STROKE, FINE } from "../../constants/strokes";
import { EyeDot } from "../EyeDot/EyeDot";

/** Hard side-eye with a raised brow — somebody edited an expense. */
export function SideEyeGlyph() {
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

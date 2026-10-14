/** Activity glyph for a comment: a speech bubble mid-yap. */

import { STROKE, SOLID } from "../../constants/strokes";
import { EyeDot } from "../EyeDot/EyeDot";

/** A speech bubble mid-yap. */
export function YappingGlyph() {
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

/** Activity glyph for an added expense: a receipt caught mid-scream. */

import { STROKE, FINE } from "../../constants/strokes";
import { EyeDot } from "../EyeDot/EyeDot";

/** A receipt caught mid-scream — a new expense just landed. */
export function ShockedReceiptGlyph() {
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

/** Activity glyph for a payment received: dollar-sign eyes over a huge grin. */

import { STROKE, SOLID } from "../../constants/strokes";
import { Dollar } from "../Dollar/Dollar";

/** Dollar-sign eyes over a huge grin — you got paid. */
export function CashGrinGlyph() {
  return (
    <>
      <circle {...STROKE} cx="12" cy="12" r="8.4" />
      <Dollar x={8.6} y={10} scale={0.85} />
      <Dollar x={15.4} y={10} scale={0.85} />
      <path {...SOLID} d="M7.4 14.6c.7 2.4 2.4 3.7 4.6 3.7s3.9-1.3 4.6-3.7z" />
    </>
  );
}

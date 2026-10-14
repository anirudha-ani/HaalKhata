/** Activity glyph for a new member: two faces, the newcomer winking. */

import { STROKE, FINE } from "../../constants/strokes";
import { EyeDot } from "../EyeDot/EyeDot";

/** Two faces, the newcomer winking — somebody joined. */
export function BuddiesGlyph() {
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

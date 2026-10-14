/** Activity glyph for a new group: party hat and confetti. */

import { STROKE, SOLID } from "../../constants/strokes";
import { EyeDot } from "../EyeDot/EyeDot";

/** Party hat and confetti — a group now exists, and that is an occasion. */
export function PartyHatGlyph() {
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

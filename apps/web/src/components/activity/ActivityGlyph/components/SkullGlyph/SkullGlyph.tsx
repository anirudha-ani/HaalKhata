/** Activity glyph for something deleted: a skull with X'd-out eyes. */

import { STROKE, FINE } from "../../constants/strokes";

/** A skull with X'd-out eyes — the expense is gone. */
export function SkullGlyph() {
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

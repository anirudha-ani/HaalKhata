/** A sheet must sit wholly on one side of a fold, never across the crease. */

import { describe, expect, it } from "vitest";
import { clearOfFold } from "./clearOfFold";

const FOLD_MARGIN = 16;
/** iPhone Duo's inner display held upright: status bar across the top, home indicator below. */
const UPRIGHT_INSETS = { top: 84, bottom: 20, left: 0, right: 0 };
/** Held wide: the status bar runs down the right edge. */
const WIDE_INSETS = { top: 0, bottom: 20, left: 0, right: 84 };
/** A window with no system bars at all. */
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

describe("clear of the fold", () => {
  it("asks nothing of an unfolded window", () => {
    expect(clearOfFold({ width: 669, height: 951 }, null, UPRIGHT_INSETS, FOLD_MARGIN)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
  it("puts the sheet below a fold across the middle, on the half lying flat", () => {
    // iPhone Duo held upright and standing half open.
    const across = { x: 0, y: 455, width: 669, height: 40 };
    expect(clearOfFold({ width: 669, height: 951 }, across, UPRIGHT_INSETS, FOLD_MARGIN)).toEqual({ top: 455 + 40 + FOLD_MARGIN, bottom: 0, left: 0, right: 0 });
  });
  it("puts the sheet above a fold that leaves more room there", () => {
    const lowFold = { x: 0, y: 700, width: 669, height: 40 };
    expect(clearOfFold({ width: 669, height: 951 }, lowFold, UPRIGHT_INSETS, FOLD_MARGIN)).toEqual({ top: 0, bottom: 951 - 700 + FOLD_MARGIN, left: 0, right: 0 });
  });
  it("counts the status bar against the side it sits on", () => {
    // Held upright, a fold below the middle still leaves the lower side
    // more room, since the status bar takes the top of the upper one.
    const belowMiddle = { x: 0, y: 470, width: 669, height: 40 };
    expect(clearOfFold({ width: 669, height: 951 }, belowMiddle, UPRIGHT_INSETS, FOLD_MARGIN).top).toBe(470 + 40 + FOLD_MARGIN);
    expect(clearOfFold({ width: 669, height: 951 }, belowMiddle, NO_INSETS, FOLD_MARGIN).bottom).toBe(951 - 470 + FOLD_MARGIN);
  });
  it("puts the sheet left of a book's fold, away from the status bar down the right", () => {
    // iPhone Duo held wide and open like a book: equal halves, but the
    // status bar takes 84 points of the right one.
    const down = { x: 455, y: 0, width: 40, height: 669 };
    expect(clearOfFold({ width: 951, height: 669 }, down, WIDE_INSETS, FOLD_MARGIN)).toEqual({ top: 0, bottom: 0, left: 0, right: 951 - 455 + FOLD_MARGIN });
  });
  it("puts the sheet right of a fold down the middle when both sides have equal room", () => {
    const down = { x: 455, y: 0, width: 40, height: 669 };
    expect(clearOfFold({ width: 950, height: 669 }, down, NO_INSETS, FOLD_MARGIN)).toEqual({ top: 0, bottom: 0, left: 455 + 40 + FOLD_MARGIN, right: 0 });
  });
  it("puts the sheet right of a fold that leaves more room there", () => {
    const early = { x: 300, y: 0, width: 40, height: 669 };
    expect(clearOfFold({ width: 951, height: 669 }, early, WIDE_INSETS, FOLD_MARGIN)).toEqual({ top: 0, bottom: 0, left: 300 + 40 + FOLD_MARGIN, right: 0 });
  });
});

/** Unit tests for a button's press and disabled look. */

import { describe, expect, it } from "vitest";
import { DISABLED_OPACITY, PRESS_OPACITY, PRESS_SCALE } from "./motion.constants";
import { pressStyle } from "./pressStyle";

describe("pressStyle", () => {
  it("shows a released button at full size and opacity", () => {
    expect(pressStyle(0, false, false)).toEqual({ opacity: 1, transform: [{ scale: 1 }] });
  });

  it("dims and shrinks a held button", () => {
    expect(pressStyle(1, false, false)).toEqual({
      opacity: PRESS_OPACITY,
      transform: [{ scale: PRESS_SCALE }],
    });
  });

  it("only dims a held button under Reduce Motion", () => {
    expect(pressStyle(1, false, true)).toEqual({
      opacity: PRESS_OPACITY,
      transform: [{ scale: 1 }],
    });
  });

  it("dims a disabled button whatever the press says", () => {
    // The case that looked enabled: pressed, then disabled while its
    // request runs or after the request refused what was sent.
    for (const pressed of [0, 0.5, 1]) {
      expect(pressStyle(pressed, true, false)).toEqual({
        opacity: DISABLED_OPACITY,
        transform: [{ scale: 1 }],
      });
    }
  });
});

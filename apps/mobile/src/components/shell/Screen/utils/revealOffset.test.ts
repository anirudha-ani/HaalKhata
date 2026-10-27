/** Unit tests for scrolling a block that grew back onto the screen. */

import { describe, expect, it } from "vitest";
import { revealOffset } from "./revealOffset";

// A screen 600pt tall, scrolled to 1000: a block 1700pt down the content
// starts 700pt below the top of what is visible.
const SCROLLED_TO = 1000;

describe("revealOffset", () => {
  it("scrolls just far enough to bring a pushed-down block's bottom back with its margin", () => {
    // The block starts 500pt down and is 120pt tall: its bottom is 20pt past
    // the edge, 36pt counting the 16pt margin.
    expect(
      revealOffset({ contentTop: SCROLLED_TO + 500, visibleTop: 500, height: 120, viewportHeight: 600, margin: 16 }),
    ).toBe(SCROLLED_TO + 36);
  });

  it("leaves a block that already fits where it is", () => {
    expect(
      revealOffset({ contentTop: SCROLLED_TO + 300, visibleTop: 300, height: 120, viewportHeight: 600, margin: 16 }),
    ).toBeNull();
  });

  it("brings a block that ended up wholly below the screen into view", () => {
    expect(
      revealOffset({ contentTop: SCROLLED_TO + 700, visibleTop: 700, height: 100, viewportHeight: 600, margin: 16 }),
    ).toBe(SCROLLED_TO + 216);
  });

  it("keeps the top of a block taller than the screen in view", () => {
    expect(
      revealOffset({ contentTop: SCROLLED_TO + 400, visibleTop: 400, height: 900, viewportHeight: 600, margin: 16 }),
    ).toBe(SCROLLED_TO + 384);
  });

  it("does not scroll back up to a block above what is visible", () => {
    expect(
      revealOffset({ contentTop: SCROLLED_TO - 200, visibleTop: -200, height: 100, viewportHeight: 600, margin: 16 }),
    ).toBeNull();
  });
});

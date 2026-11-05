/** Each side of the navigation bar must clear its own inset, in either reading direction. */

import { describe, expect, it } from "vitest";
import { NAVIGATION_RAIL_WIDTH } from "@/lib/layout/constants/layout";
import { navigationInsets } from "./navigationInsets";

// iPhone Duo's outer display, and its inner display held wide: the status bar runs down the right edge.
const STATUS_BAR_ON_RIGHT = { top: 0, right: 84, bottom: 20, left: 0 };

describe("navigation insets", () => {
  it("gives the bottom bar no side insets from the navigator and pads each side by its own", () => {
    expect(navigationInsets(STATUS_BAR_ON_RIGHT, false, false)).toEqual({
      navigatorInsets: { left: 0, right: 0 },
      barStyle: { paddingStart: 0, paddingEnd: 84 },
    });
  });
  it("swaps leading and trailing when the layout runs right to left", () => {
    expect(navigationInsets(STATUS_BAR_ON_RIGHT, false, true).barStyle).toEqual({ paddingStart: 84, paddingEnd: 0 });
  });
  it("widens the rail by the inset on its own side", () => {
    expect(navigationInsets({ top: 24, right: 0, bottom: 20, left: 59 }, true, false)).toEqual({
      navigatorInsets: { left: 59, right: 59 },
      barStyle: { width: NAVIGATION_RAIL_WIDTH + 59 },
    });
    // On the left the rail is clear of the Duo's status bar already.
    expect(navigationInsets(STATUS_BAR_ON_RIGHT, true, false).barStyle).toEqual({ width: NAVIGATION_RAIL_WIDTH });
  });
  it("moves the rail's inset to the right edge when the rail sits there", () => {
    expect(navigationInsets(STATUS_BAR_ON_RIGHT, true, true)).toEqual({
      navigatorInsets: { left: 84, right: 84 },
      barStyle: { width: NAVIGATION_RAIL_WIDTH + 84 },
    });
  });
});

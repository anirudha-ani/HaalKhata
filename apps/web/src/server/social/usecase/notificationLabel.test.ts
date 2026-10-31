/** Regressions for long user text displacing the action, group or money in a notification. */

import { describe, expect, it } from "vitest";
import { NOTIFICATION_LABEL_MAX_LENGTH } from "@/server/social/social.constants";
import { notificationLabel } from "./notificationLabel";

describe("notification label excerpts", () => {
  it("keeps ordinary labels and makes pasted line breaks one line", () => {
    expect(notificationLabel("  Goa\n trip  ")).toBe("Goa trip");
  });

  it("reserves space for the other facts instead of sending a whole long label", () => {
    const excerpt = notificationLabel("Very long dinner description ".repeat(10));
    expect([...excerpt].length).toBeLessThanOrEqual(NOTIFICATION_LABEL_MAX_LENGTH);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it("never separates a family emoji or a skin-tone sequence", () => {
    const family = "👨‍👩‍👧‍👦";
    const chef = "👩🏽‍🍳";
    expect(notificationLabel(family.repeat(10))).toBe(`${family.repeat(4)}…`);
    expect(notificationLabel(chef.repeat(10))).toBe(`${chef.repeat(7)}…`);
  });
});

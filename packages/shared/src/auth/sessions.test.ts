/** A device list says plainly what each sign-in is, with the one in use first. */

import { describe, expect, it } from "vitest";
import { lastActiveLabel, sessionDetail, sessionsInOrder } from "./sessions";

const CLOCK = Date.UTC(2026, 9, 31, 12);

/**
 * A moment in the past.
 *
 * @param days - How many days ago.
 * @returns It as an ISO timestamp.
 */
const daysAgo = (days: number) => new Date(CLOCK - days * 24 * 60 * 60 * 1000).toISOString();

describe("how recently a device was used", () => {
  it.each([
    [0, "Active today"],
    [1, "Active yesterday"],
    [6, "Active 6 days ago"],
    [29, "Active 29 days ago"],
    [30, "Active about a month ago"],
    [59, "Active about a month ago"],
    [95, "Active about 3 months ago"],
  ])("%i days ago reads as %s", (days, label) => {
    expect(lastActiveLabel(daysAgo(days), CLOCK)).toBe(label);
  });

  it("does not say a device was used in the future when a clock is behind", () => {
    expect(lastActiveLabel(daysAgo(-2), CLOCK)).toBe("Active today");
  });
});

describe("the line under a device's name", () => {
  it("calls the one in use this device", () => {
    expect(sessionDetail({ current: true, device: "iPhone 15", isApp: true, lastUsedAt: daysAgo(3) }, CLOCK)).toBe("This device");
  });

  it("says a phone is the app, since a model name does not", () => {
    expect(sessionDetail({ current: false, device: "iPhone 15", isApp: true, lastUsedAt: daysAgo(3) }, CLOCK)).toBe("HaalKhata app · Active 3 days ago");
  });

  it("does not say the app twice for a phone with no model name", () => {
    expect(sessionDetail({ current: false, device: "HaalKhata app", isApp: true, lastUsedAt: daysAgo(3) }, CLOCK)).toBe("Active 3 days ago");
  });

  it("leaves a browser's name to speak for itself", () => {
    expect(sessionDetail({ current: false, device: "Chrome on Mac", isApp: false, lastUsedAt: daysAgo(3) }, CLOCK)).toBe("Active 3 days ago");
  });
});

describe("the order of the list", () => {
  it("puts the device in use first and keeps the rest as they came", () => {
    const sessions = [{ id: "a", current: false }, { id: "b", current: true }, { id: "c", current: false }];

    expect(sessionsInOrder(sessions).map((session) => session.id)).toEqual(["b", "a", "c"]);
  });
});

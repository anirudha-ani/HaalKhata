/** Tests for the Notifications card's pure helpers. */

import { describe, expect, it } from "vitest";
import { DEFAULT_PUSH_PREFERENCES } from "./categories";
import { describePushDevice, toPushPreferenceValues, withPushSwitch } from "./settings";

describe("withPushSwitch", () => {
  it("changes one switch and keeps the others", () => {
    expect(withPushSwitch(DEFAULT_PUSH_PREFERENCES, "groups", false)).toEqual({
      ...DEFAULT_PUSH_PREFERENCES,
      groups: false,
    });
  });

  it("drops anything that is not a switch", () => {
    const message = { ...DEFAULT_PUSH_PREFERENCES, $typeName: "push.v1.PushPreferences" };
    expect(Object.keys(withPushSwitch(message, "expenses", false)).sort()).toEqual([
      "comments",
      "expenses",
      "friends",
      "groups",
      "payments",
    ]);
  });
});

describe("toPushPreferenceValues", () => {
  it("copies the five switches", () => {
    expect(toPushPreferenceValues({ ...DEFAULT_PUSH_PREFERENCES, payments: false })).toEqual({
      ...DEFAULT_PUSH_PREFERENCES,
      payments: false,
    });
  });
});

describe("describePushDevice", () => {
  const clockTime = new Date("2026-10-16T12:00:00.000Z");

  it("names the phone by its label and says when it last heard from us", () => {
    const description = describePushDevice(
      { platform: "ios", label: "iPhone 17", lastSeenAt: "2026-10-15T09:00:00.000Z", lastSentAt: "" },
      clockTime,
    );
    expect(description.name).toBe("iPhone 17");
    expect(description.detail).toContain("Last opened");
    expect(description.detail).toContain("none yet");
  });

  it("falls back to a platform name without a label", () => {
    expect(describePushDevice({ platform: "android", label: "", lastSeenAt: "", lastSentAt: "" }, clockTime).name).toBe(
      "Android phone",
    );
    expect(describePushDevice({ platform: "ios", label: "", lastSeenAt: "", lastSentAt: "" }, clockTime).name).toBe("iPhone");
  });
});

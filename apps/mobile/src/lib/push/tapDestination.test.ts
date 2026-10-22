/** Tests for where a tapped push opens. */

import { describe, expect, it } from "vitest";
import { tapDestination } from "./tapDestination";

const PLAIN_TAP = "expo.modules.notifications.actions.DEFAULT";

describe("tapDestination", () => {
  it("opens the push's own screen for the person it was sent to", () => {
    expect(
      tapDestination(
        { actionIdentifier: PLAIN_TAP, data: { link: "/expenses/exp-1", recipientId: "user-a" } },
        PLAIN_TAP,
        "user-a",
      ),
    ).toBe("/expenses/exp-1");
  });

  it("opens Account for the security alert", () => {
    expect(
      tapDestination({ actionIdentifier: PLAIN_TAP, data: { link: "/account", recipientId: "user-a" } }, PLAIN_TAP, "user-a"),
    ).toBe("/account");
  });

  it("ignores a push sent to another account on this phone", () => {
    expect(
      tapDestination(
        { actionIdentifier: PLAIN_TAP, data: { link: "/expenses/exp-1", recipientId: "user-b" } },
        PLAIN_TAP,
        "user-a",
      ),
    ).toBeNull();
  });

  it("ignores anything but a plain tap", () => {
    expect(
      tapDestination(
        { actionIdentifier: "expo.modules.notifications.actions.DISMISS", data: { link: "/groups/g", recipientId: "user-a" } },
        PLAIN_TAP,
        "user-a",
      ),
    ).toBeNull();
  });

  it.each([undefined, {}, { recipientId: 7 }])("ignores a push without a recipient (%s)", (data) => {
    expect(tapDestination({ actionIdentifier: PLAIN_TAP, data }, PLAIN_TAP, "user-a")).toBeNull();
  });

  it("sends a link outside the allowlist to the feed", () => {
    expect(
      tapDestination(
        { actionIdentifier: PLAIN_TAP, data: { link: "https://attacker.example", recipientId: "user-a" } },
        PLAIN_TAP,
        "user-a",
      ),
    ).toBe("/activity");
  });
});

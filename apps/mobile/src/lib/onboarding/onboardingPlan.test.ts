/** Tests for planning the first-run flow from the account and this phone. */

import { describe, expect, it } from "vitest";
import {
  onboardingDestination,
  onboardingProgress,
  planOnboardingSteps,
  type OnboardingSituation,
} from "./onboardingPlan";

const NEW_ACCOUNT: OnboardingSituation = {
  accountSetup: true,
  deviceSetupOwed: true,
  phoneVerified: false,
  contactsAccess: "undetermined",
  pushPermission: "undetermined",
};

describe("planOnboardingSteps", () => {
  it("walks a new account through everything, ending all set", () => {
    expect(planOnboardingSteps(NEW_ACCOUNT)).toEqual([
      "profile",
      "phone",
      "payment",
      "friends",
      "notifications",
      "done",
    ]);
  });

  it("keeps the phone step for a verified number during account setup, for the discovery switch", () => {
    expect(planOnboardingSteps({ ...NEW_ACCOUNT, phoneVerified: true })).toContain("phone");
  });

  it("gives a set-up account signing in on a new phone only the device steps", () => {
    expect(planOnboardingSteps({ ...NEW_ACCOUNT, accountSetup: false, phoneVerified: true })).toEqual([
      "friends",
      "notifications",
      "done",
    ]);
    expect(planOnboardingSteps({ ...NEW_ACCOUNT, accountSetup: false })).toEqual([
      "phone",
      "friends",
      "notifications",
      "done",
    ]);
  });

  it("never interrupts a set-up account that did not just sign in here", () => {
    expect(planOnboardingSteps({ ...NEW_ACCOUNT, accountSetup: false, deviceSetupOwed: false })).toEqual([]);
  });

  it("leaves out questions this phone already answered", () => {
    const answered = { ...NEW_ACCOUNT, accountSetup: false, phoneVerified: true, pushPermission: "granted" as const };
    expect(planOnboardingSteps({ ...answered, contactsAccess: "denied" })).toEqual([]);
    expect(planOnboardingSteps({ ...answered, contactsAccess: "blocked" })).toEqual([]);
    expect(planOnboardingSteps({ ...answered, contactsAccess: undefined })).toEqual([]);
    // Access already given still has friends to show.
    expect(planOnboardingSteps({ ...answered, contactsAccess: "limited" })).toEqual(["friends", "done"]);
    expect(planOnboardingSteps({ ...answered, contactsAccess: "denied", pushPermission: "unknown" })).toEqual([]);
  });
});

describe("onboardingDestination", () => {
  it("returns to an allowed screen the flow interrupted", () => {
    expect(onboardingDestination("/groups/trip-1")).toBe("/groups/trip-1");
    expect(onboardingDestination("/friends")).toBe("/friends");
  });

  it("falls back to Home for anything else", () => {
    for (const candidate of [undefined, "", "/dashboard", "https://evil.example", "//evil", "/onboarding", 7, "/groups/../x"]) {
      expect(onboardingDestination(candidate)).toBe("/dashboard");
    }
  });
});

describe("onboardingProgress", () => {
  it("counts the steps before done", () => {
    const steps = planOnboardingSteps(NEW_ACCOUNT);
    expect(onboardingProgress(steps, "profile")).toEqual({ total: 5, position: 1 });
    expect(onboardingProgress(steps, "notifications")).toEqual({ total: 5, position: 5 });
    expect(onboardingProgress(steps, "done")).toEqual({ total: 5, position: 5 });
  });
});

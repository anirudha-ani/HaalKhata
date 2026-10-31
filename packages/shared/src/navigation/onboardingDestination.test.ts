/** Tests for where somebody lands when first-run setup ends. */

import { describe, expect, it } from "vitest";
import { onboardingDestination } from "./onboardingDestination";

describe("onboardingDestination", () => {
  it("returns to the form of a bill somebody just joined", () => {
    expect(onboardingDestination("/expenses/new?edit=bill-1")).toBe("/expenses/new?edit=bill-1");
    expect(onboardingDestination("/expenses/new?edit=bill-1&invite=1")).toBe("/expenses/new?edit=bill-1&invite=1");
  });

  it("lets no other query through", () => {
    expect(onboardingDestination("/expenses/new?edit=bill-1&next=//evil.example")).toBe("/dashboard");
    expect(onboardingDestination("/expenses/new?edit=../account")).toBe("/dashboard");
    expect(onboardingDestination("/groups/trip-1?x=1")).toBe("/dashboard");
  });

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

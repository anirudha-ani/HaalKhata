/** Tests for reading and saving the contact-discovery answer. */

import { describe, expect, it } from "vitest";
import {
  ContactDiscovery,
  isDiscoverable,
  needsDiscoveryAnswer,
  onboardingDiscoveryChange,
} from "./discovery";

describe("contact discovery answer", () => {
  it("treats only an explicit yes as findable", () => {
    expect(isDiscoverable(ContactDiscovery.ON)).toBe(true);
    expect(isDiscoverable(ContactDiscovery.OFF)).toBe(false);
    expect(isDiscoverable(ContactDiscovery.UNSPECIFIED)).toBe(false);
  });

  it("asks only people who never answered", () => {
    expect(needsDiscoveryAnswer(ContactDiscovery.UNSPECIFIED)).toBe(true);
    expect(needsDiscoveryAnswer(ContactDiscovery.OFF)).toBe(false);
    expect(needsDiscoveryAnswer(ContactDiscovery.ON)).toBe(false);
  });

  it("saves the onboarding switch only when it records a real choice", () => {
    expect(onboardingDiscoveryChange(ContactDiscovery.UNSPECIFIED, true)).toBe(true);
    expect(onboardingDiscoveryChange(ContactDiscovery.OFF, true)).toBe(true);
    expect(onboardingDiscoveryChange(ContactDiscovery.ON, true)).toBeNull();
    // A switch left off is silence, not a refusal: the prompt asks later.
    expect(onboardingDiscoveryChange(ContactDiscovery.UNSPECIFIED, false)).toBeNull();
    expect(onboardingDiscoveryChange(ContactDiscovery.OFF, false)).toBeNull();
    expect(onboardingDiscoveryChange(ContactDiscovery.ON, false)).toBe(false);
  });
});

/** Tests for reading and saving the contact-discovery answer. */

import { describe, expect, it } from "vitest";
import {
  ContactDiscovery,
  isDiscoverable,
  needsDiscoveryAnswer,
  onboardingDiscoveryChange,
} from "./discovery";

describe("contact discovery answer", () => {
  it("is findable by default and hidden only by an explicit no", () => {
    expect(isDiscoverable(ContactDiscovery.ON)).toBe(true);
    expect(isDiscoverable(ContactDiscovery.UNSPECIFIED)).toBe(true);
    expect(isDiscoverable(ContactDiscovery.OFF)).toBe(false);
  });

  it("tells only people who never answered", () => {
    expect(needsDiscoveryAnswer(ContactDiscovery.UNSPECIFIED)).toBe(true);
    expect(needsDiscoveryAnswer(ContactDiscovery.OFF)).toBe(false);
    expect(needsDiscoveryAnswer(ContactDiscovery.ON)).toBe(false);
  });

  it("saves wherever the onboarding switch was left, unless the server already holds it", () => {
    // Left on by someone who never answered: the yes is recorded, so the
    // one-time notice does not repeat what onboarding just showed.
    expect(onboardingDiscoveryChange(ContactDiscovery.UNSPECIFIED, true)).toBe(true);
    expect(onboardingDiscoveryChange(ContactDiscovery.OFF, true)).toBe(true);
    expect(onboardingDiscoveryChange(ContactDiscovery.ON, true)).toBeNull();
    expect(onboardingDiscoveryChange(ContactDiscovery.UNSPECIFIED, false)).toBe(false);
    expect(onboardingDiscoveryChange(ContactDiscovery.ON, false)).toBe(false);
    expect(onboardingDiscoveryChange(ContactDiscovery.OFF, false)).toBeNull();
  });
});

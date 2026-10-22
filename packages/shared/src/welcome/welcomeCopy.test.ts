/** The welcome story stays the size both layouts were designed around. */

import { describe, expect, it } from "vitest";
import { WELCOME_HERO, WELCOME_STEPS } from "./welcomeCopy";

describe("welcome copy", () => {
  it("has three numbered steps in order", () => {
    expect(WELCOME_STEPS.map((step) => step.number)).toEqual(["01", "02", "03"]);
  });

  it("keeps each step short enough for one phone page", () => {
    for (const step of WELCOME_STEPS) {
      expect(step.title.length).toBeLessThanOrEqual(12);
      expect(step.detail.length).toBeLessThanOrEqual(120);
    }
  });

  it("splits the headline into a lead and an accent", () => {
    expect(`${WELCOME_HERO.titleLead} ${WELCOME_HERO.titleAccent}`).toBe("Stop being the group accountant.");
  });
});

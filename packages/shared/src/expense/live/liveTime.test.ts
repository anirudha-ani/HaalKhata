/** Tests for the words a live split shows for its time left. */

import { describe, expect, it } from "vitest";
import { liveTimeLeft } from "./liveTime";

describe("liveTimeLeft", () => {
  const start = Date.parse("2026-10-31T12:00:00Z");

  it("rounds up to whole minutes", () => {
    expect(liveTimeLeft("2026-10-31T12:29:30Z", start)).toBe("30 min left");
  });

  it("says nothing once it is over", () => {
    expect(liveTimeLeft("2026-10-31T11:59:00Z", start)).toBe("");
  });
});

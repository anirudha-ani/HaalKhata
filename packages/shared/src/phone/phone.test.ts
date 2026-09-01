/** Unit tests for the phone field's country metadata and E.164 composition. */

import { describe, expect, it } from "vitest";
import {
  composeE164,
  flagEmoji,
  isValidPhone,
  phoneCountry,
  PHONE_COUNTRIES,
  splitE164,
} from "./phone";

describe("flagEmoji", () => {
  it("maps a region code to regional indicators", () => {
    expect(flagEmoji("BD")).toBe("🇧🇩");
    expect(flagEmoji("US")).toBe("🇺🇸");
  });

  it("accepts lowercase", () => {
    expect(flagEmoji("gb")).toBe(flagEmoji("GB"));
  });
});

describe("PHONE_COUNTRIES", () => {
  it("covers the countries a user would look for", () => {
    const regions = new Set(PHONE_COUNTRIES.map((country) => country.region));
    for (const region of ["US", "BD", "IN", "GB", "CA"]) {
      expect(regions.has(region as never)).toBe(true);
    }
  });

  it("carries the right dial codes", () => {
    expect(phoneCountry("BD").dialCode).toBe("880");
    expect(phoneCountry("US").dialCode).toBe("1");
  });

  it("is sorted by name, so the list can be scanned", () => {
    const names = PHONE_COUNTRIES.map((country) => country.name);
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
  });

  it("falls back to the default region for an unknown code", () => {
    expect(phoneCountry("ZZ").region).toBe("US");
  });
});

describe("composeE164", () => {
  it("joins the dial code to the digits typed", () => {
    expect(composeE164("US", "4015379205")).toBe("+14015379205");
    expect(composeE164("BD", "1712345678")).toBe("+8801712345678");
  });

  it("drops punctuation and spacing", () => {
    expect(composeE164("US", "(617) 555-1212")).toBe("+16175551212");
  });

  it("returns empty for a number with no digits, rather than a bare dial code", () => {
    expect(composeE164("US", "")).toBe("");
    expect(composeE164("US", "   ")).toBe("");
    expect(composeE164("BD", "()-")).toBe("");
  });
});

describe("splitE164", () => {
  it("splits a stored number back into its two halves", () => {
    expect(splitE164("+8801712345678")).toEqual({
      region: "BD",
      nationalNumber: "1712345678",
    });
  });

  it("round-trips with composeE164", () => {
    const split = splitE164("+16175551212");
    expect(split).not.toBeNull();
    expect(composeE164(split!.region, split!.nationalNumber)).toBe("+16175551212");
  });

  it("returns null for a national number, which belongs to the selected country", () => {
    expect(splitE164("6175551212")).toBeNull();
    expect(splitE164("(617) 555-1212")).toBeNull();
  });

  it("returns null for something that is not a phone number", () => {
    expect(splitE164("+")).toBeNull();
    expect(splitE164("+000")).toBeNull();
  });
});

describe("isValidPhone", () => {
  it("accepts a real national number for the selected country", () => {
    expect(isValidPhone("US", "(617) 555-0123")).toBe(true);
    expect(isValidPhone("BD", "1712-345678")).toBe(true);
  });

  it("rejects digits that are not a dialable number there", () => {
    // Too short and too long are invalid in every numbering plan; a
    // cross-country example would depend on one plan's prefix ranges.
    expect(isValidPhone("US", "12345")).toBe(false);
    expect(isValidPhone("US", "617555012345678")).toBe(false);
    expect(isValidPhone("BD", "12")).toBe(false);
  });

  it("rejects an empty number box", () => {
    expect(isValidPhone("US", "")).toBe(false);
    expect(isValidPhone("US", "  -  ")).toBe(false);
  });
});

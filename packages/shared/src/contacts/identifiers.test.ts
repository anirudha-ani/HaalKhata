/** Tests for turning an address book into FindContacts identifiers. */

import { describe, expect, it } from "vitest";
import {
  buildContactLookup,
  chunkContactLookup,
  contactEmail,
  contactPhone,
  lookupRegion,
  type AddressBookContact,
} from "./identifiers";

describe("contactPhone", () => {
  it("reads a national number in the country the device assigned to it", () => {
    expect(contactPhone({ number: "01712-345678", countryCode: "bd" }, "US")).toBe("+8801712345678");
  });

  it("falls back to the caller's region when the device gave no country", () => {
    expect(contactPhone({ number: "(617) 555-1212" }, "US")).toBe("+16175551212");
    expect(contactPhone({ number: "01712 345678" }, "BD")).toBe("+8801712345678");
  });

  it("ignores an unknown device country rather than guessing", () => {
    expect(contactPhone({ number: "(617) 555-1212", countryCode: "zz" }, "US")).toBe("+16175551212");
  });

  it("reads a number that carries its own country code as written", () => {
    expect(contactPhone({ number: "+880 1712 345678", countryCode: "us" }, "US")).toBe("+8801712345678");
  });

  it("drops invalid and oversized numbers without parsing them", () => {
    expect(contactPhone({ number: "12" }, "US")).toBeNull();
    expect(contactPhone({ number: "5".repeat(255) }, "US")).toBeNull();
  });
});

describe("contactEmail", () => {
  it("trims and lower-cases an address", () => {
    expect(contactEmail("  Rifat@Example.COM ")).toBe("rifat@example.com");
  });

  it("drops anything that is not an address, and anything oversized", () => {
    expect(contactEmail("rifat at example")).toBeNull();
    expect(contactEmail(`${"a".repeat(250)}@x.co`)).toBeNull();
  });
});

describe("lookupRegion", () => {
  it("uses the country of the caller's own number", () => {
    expect(lookupRegion("+8801712345678")).toBe("BD");
  });

  it("uses the app default when the caller has no number", () => {
    expect(lookupRegion("")).toBe("US");
  });
});

describe("buildContactLookup", () => {
  const mother: AddressBookContact = {
    id: "1",
    name: "Mom",
    phones: [{ number: "01712345678", countryCode: "bd" }, { number: "+8801712345678" }],
    emails: ["Mom@Example.com"],
  };
  const rifat: AddressBookContact = {
    id: "2",
    name: "Rifat",
    phones: [{ number: "+880 1712-345678" }, { number: "not a number" }],
    emails: ["me@example.com"],
  };

  it("sends each identifier once and remembers every contact that holds it", () => {
    const lookup = buildContactLookup([mother, rifat], { region: "US", ownIdentifiers: [] });
    expect(lookup.phones).toEqual(["+8801712345678"]);
    expect(lookup.emails).toEqual(["mom@example.com", "me@example.com"]);
    expect(lookup.owners.get("+8801712345678")).toEqual([mother, rifat]);
    expect(lookup.owners.get("mom@example.com")).toEqual([mother]);
  });

  it("leaves out the caller's own phone and email", () => {
    const lookup = buildContactLookup([mother, rifat], {
      region: "US",
      ownIdentifiers: ["+8801712345678", " ME@example.com"],
    });
    expect(lookup.phones).toEqual([]);
    expect(lookup.emails).toEqual(["mom@example.com"]);
  });
});

describe("chunkContactLookup", () => {
  it("splits identifiers into calls of the given size, phones first", () => {
    const chunks = chunkContactLookup(
      { phones: ["+1", "+2", "+3"], emails: ["a@x.co", "b@x.co"] },
      2,
    );
    expect(chunks).toEqual([
      { phones: ["+1", "+2"], emails: [] },
      { phones: ["+3"], emails: ["a@x.co"] },
      { phones: [], emails: ["b@x.co"] },
    ]);
  });

  it("makes no call for an empty address book", () => {
    expect(chunkContactLookup({ phones: [], emails: [] })).toEqual([]);
  });

  it("uses the server's per-call limit by default", () => {
    const phones = Array.from({ length: 2500 }, (_unusedValue, index) => `+${index}`);
    expect(chunkContactLookup({ phones, emails: [] }).map((chunk) => chunk.phones.length)).toEqual([
      1000, 1000, 500,
    ]);
  });
});

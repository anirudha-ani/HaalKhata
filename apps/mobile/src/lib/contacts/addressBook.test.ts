/** Tests for mapping device contacts onto the shared shape. */

import { describe, expect, it } from "vitest";
import { toAddressBookContact } from "./addressBook";

describe("toAddressBookContact", () => {
  it("keeps the name, numbers and addresses, and drops empty entries", () => {
    expect(
      toAddressBookContact({
        id: "contact-1",
        fullName: "  Rifat Hasan ",
        phones: [{ number: "+880 1712-345678" }, {}, { number: "" }],
        emails: [{ address: "rifat@example.com" }, {}],
      }),
    ).toEqual({
      id: "contact-1",
      name: "Rifat Hasan",
      phones: [{ number: "+880 1712-345678" }],
      emails: ["rifat@example.com"],
    });
  });

  it("copes with a contact that has no name, numbers or emails", () => {
    expect(toAddressBookContact({ id: "contact-2", fullName: null })).toEqual({
      id: "contact-2",
      name: "",
      phones: [],
      emails: [],
    });
  });
});

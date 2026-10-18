/** Tests for reading the contacts permission. */

import { describe, expect, it } from "vitest";
import { contactsAccessOf } from "./contactsAccess";

describe("contactsAccessOf", () => {
  it("separates full and limited access", () => {
    expect(contactsAccessOf({ status: "granted", canAskAgain: true, accessPrivileges: "all" })).toBe("all");
    expect(contactsAccessOf({ status: "granted", canAskAgain: true, accessPrivileges: "limited" })).toBe("limited");
  });

  it("treats an Android grant, which reports no privileges, as full access", () => {
    expect(contactsAccessOf({ status: "granted", canAskAgain: true })).toBe("all");
  });

  it("tells a refusal the OS will ask about again from one only Settings can undo", () => {
    expect(contactsAccessOf({ status: "denied", canAskAgain: true })).toBe("denied");
    expect(contactsAccessOf({ status: "denied", canAskAgain: false })).toBe("blocked");
  });

  it("reports a question never asked", () => {
    expect(contactsAccessOf({ status: "undetermined", canAskAgain: true })).toBe("undetermined");
  });
});

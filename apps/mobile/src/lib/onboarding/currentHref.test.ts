/** Tests for rebuilding the current address across the setup steps. */

import { describe, expect, it } from "vitest";
import { currentHref } from "./currentHref";

describe("currentHref", () => {
  it("keeps the query, which is what says which bill the form is on", () => {
    expect(currentHref("/expenses/new", { edit: "bill-1", invite: "1" })).toBe("/expenses/new?edit=bill-1&invite=1");
  });

  it("is the path alone when there is no query", () => {
    expect(currentHref("/dashboard", {})).toBe("/dashboard");
  });

  it("leaves out a param the path already holds", () => {
    expect(currentHref("/groups/group-1", { id: "group-1" })).toBe("/groups/group-1");
  });

  it("escapes what it carries", () => {
    expect(currentHref("/expenses/new", { edit: "a b&c" })).toBe("/expenses/new?edit=a+b%26c");
  });

  it("ignores a param that is a list or missing", () => {
    expect(currentHref("/expenses/new", { edit: undefined, rest: ["x", "y"] })).toBe("/expenses/new");
  });
});

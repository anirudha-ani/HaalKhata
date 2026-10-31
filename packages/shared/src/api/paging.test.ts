/** Unit tests for the wording shared by the paged lists. */

import { describe, expect, it } from "vitest";
import { statementEndLine } from "./paging";

describe("statementEndLine", () => {
  it("names the friend the history is with", () => {
    expect(statementEndLine("Ben")).toBe("That's your whole history with Ben.");
  });
});

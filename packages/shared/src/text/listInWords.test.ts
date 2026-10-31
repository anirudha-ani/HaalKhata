/** Unit tests for joining phrases into a sentence. */

import { describe, expect, it } from "vitest";
import { listInWords } from "./listInWords";

describe("listInWords", () => {
  it("joins none, one, two and more the way a sentence does", () => {
    expect(listInWords([])).toBe("");
    expect(listInWords(["Ana"])).toBe("Ana");
    expect(listInWords(["Ana", "Ben"])).toBe("Ana and Ben");
    expect(listInWords(["Ana", "Ben", "Dev"])).toBe("Ana, Ben and Dev");
  });
});

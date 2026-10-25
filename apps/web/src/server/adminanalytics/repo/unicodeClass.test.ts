/** Tests for building Postgres bracket contents from Unicode properties. */

import { describe, expect, it } from "vitest";
import { unicodeClass } from "./unicodeClass";

describe("unicodeClass", () => {
  const digits = unicodeClass(/^\p{Nd}$/u);

  it("covers decimal digits in every script, ASCII first", () => {
    expect(digits.startsWith("\\u0030-\\u0039")).toBe(true);
    expect(digits).toContain("\\u0660-\\u0669"); // Arabic-Indic
    expect(digits).toContain("\\u09E6-\\u09EF"); // Bengali
    expect(digits).toContain("\\uFF10-\\uFF19"); // full-width
    expect(digits).toContain("\\U000104A0-\\U000104A9"); // above the basic plane
  });

  it("writes a single character without a range", () => {
    expect(unicodeClass(/^­$/u)).toBe("\\u00AD");
  });

  it("covers the characters nobody can see", () => {
    const invisible = unicodeClass(/^\p{Cf}$/u);
    expect(invisible).toContain("\\u200B-\\u200F");
    expect(invisible).toContain("\\uFEFF");
  });

  it("holds only escapes and hyphens, so it is safe inside a quoted SQL literal", () => {
    expect(digits).toMatch(/^(\\u[0-9A-F]{4}|\\U[0-9A-F]{8}|-)+$/);
  });
});

/** External provider names cannot bypass prepublication text filtering. */

import { expect, it } from "vitest";
import { MAX_USER_NAME_LENGTH } from "../../auth.constants";
import { providerDisplayName } from "./providerDisplayName";

it("preserves a legitimate Unicode name and bounds long provider names", () => {
  expect(providerDisplayName("  অনিরুদ্ধ Paul  ")).toBe("অনিরুদ্ধ Paul");
  expect(providerDisplayName("A".repeat(MAX_USER_NAME_LENGTH + 20))).toHaveLength(MAX_USER_NAME_LENGTH);
});

it("replaces threats and compatibility-form bypasses without rejecting login", () => {
  expect(providerDisplayName("kill yourself")).toBe("Member");
  expect(providerDisplayName("ｋｉｌｌ ｙｏｕｒｓｅｌｆ")).toBe("Member");
});

it("uses a neutral name when a provider omits it", () => {
  expect(providerDisplayName("  ")).toBe("Member");
});

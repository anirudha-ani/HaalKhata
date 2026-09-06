/** Unit tests for file-backed secret loading. */

import fileSystem from "node:fs";
import operatingSystem from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSecret } from "./secrets";

const NAME = "HK_TEST_SECRET";

afterEach(() => {
  delete process.env[NAME];
  delete process.env[`${NAME}_FILE`];
});

describe("readSecret", () => {
  it("reads and trims the file named by <NAME>_FILE, over any environment value", () => {
    const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), "hk-secret-"));
    const filePath = path.join(directory, "value");
    fileSystem.writeFileSync(filePath, "from-file\n");
    process.env[`${NAME}_FILE`] = filePath;
    process.env[NAME] = "from-env";
    expect(readSecret(NAME)).toBe("from-file");
  });

  it("falls back to the environment, then to empty", () => {
    process.env[NAME] = "from-env";
    expect(readSecret(NAME)).toBe("from-env");
    delete process.env[NAME];
    expect(readSecret(NAME)).toBe("");
  });

  it("fails loudly when the named file cannot be read", () => {
    process.env[`${NAME}_FILE`] = "/nonexistent/hk-secret";
    expect(() => readSecret(NAME)).toThrow(/could not be read/);
  });
});

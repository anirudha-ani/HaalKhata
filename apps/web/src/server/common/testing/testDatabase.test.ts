/** Unit tests for the per-run names of the integration tests' databases. */

import { describe, expect, it } from "vitest";
import { testDatabaseName } from "./testDatabase";
import { MAX_DATABASE_NAME_LENGTH } from "./testing.constants";

describe("testDatabaseName", () => {
  it("keeps the base and gives each run its own name", () => {
    const first = testDatabaseName("haalkhata_settlement_test");
    const second = testDatabaseName("haalkhata_settlement_test");
    expect(first).toMatch(/^haalkhata_settlement_test_[0-9a-f]{8}$/);
    expect(first).not.toBe(second);
  });

  it("refuses a name Postgres would cut short", () => {
    expect(() => testDatabaseName("x".repeat(MAX_DATABASE_NAME_LENGTH))).toThrow(/longer than Postgres keeps/);
  });
});

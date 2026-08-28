/** Regressions for deterministic ledger advisory-lock selection. */

import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { lockGroupLedgers, lockPairLedgers } from "./ledgerLocks";

/**
 * Builds a query-recording transaction client used to inspect lock keys.
 *
 * @returns A minimal mocked PostgreSQL transaction client.
 */
function clientStub(): PoolClient {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as PoolClient;
}

describe("ledger advisory locks", () => {
  it("sorts and deduplicates group locks", async () => {
    const client = clientStub();

    await lockGroupLedgers(client, ["group-z", "group-a", "group-z"]);

    expect(client.query).toHaveBeenNthCalledWith(1, expect.any(String), ["ledger:group:group-a"]);
    expect(client.query).toHaveBeenNthCalledWith(2, expect.any(String), ["ledger:group:group-z"]);
  });

  it("locks every participant pair in deterministic order", async () => {
    const client = clientStub();

    await lockPairLedgers(client, ["user-c", "user-a", "user-b"]);

    expect(vi.mocked(client.query).mock.calls.map((call) => call[1])).toEqual([
      ["ledger:pair:user-a|user-b"],
      ["ledger:pair:user-a|user-c"],
      ["ledger:pair:user-b|user-c"],
    ]);
  });
});

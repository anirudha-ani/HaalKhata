/** Regressions for deterministic ledger advisory-lock selection. */

import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { lockGroupLedgers, lockParticipantLedgers } from "./ledgerLocks";

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

  it("locks each participant once in deterministic order", async () => {
    const client = clientStub();

    await lockParticipantLedgers(client, ["user-c", "user-a", "user-b", "user-a"]);

    expect(vi.mocked(client.query).mock.calls.map((call) => call[1])).toEqual([
      ["ledger:participant:user-a"],
      ["ledger:participant:user-b"],
      ["ledger:participant:user-c"],
    ]);
  });

  it("grows linearly with the cast rather than per pair", async () => {
    const client = clientStub();
    const cast = Array.from({ length: 100 }, (_unused, index) => `user-${index}`);

    await lockParticipantLedgers(client, cast);

    // 100 locks, not the 4,950 a pair set would need — which is more than
    // Postgres's shared lock table holds under the production settings.
    expect(client.query).toHaveBeenCalledTimes(cast.length);
  });
});

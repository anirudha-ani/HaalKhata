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
  it("takes deduplicated group locks in one statement, sorted by the database", async () => {
    const client = clientStub();

    await lockGroupLedgers(client, ["group-z", "group-a", "group-z"]);

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(expect.stringMatching(/ORDER BY lock_key COLLATE "C"/), [
      ["ledger:group:group-z", "ledger:group:group-a"],
    ]);
  });

  it("locks each participant once", async () => {
    const client = clientStub();

    await lockParticipantLedgers(client, ["user-c", "user-a", "user-b", "user-a"]);

    expect(vi.mocked(client.query).mock.calls.map((call) => call[1])).toEqual([
      [["ledger:participant:user-c", "ledger:participant:user-a", "ledger:participant:user-b"]],
    ]);
  });

  it("grows linearly with the cast rather than per pair, in one round trip", async () => {
    const client = clientStub();
    const cast = Array.from({ length: 100 }, (_unused, index) => `user-${index}`);

    await lockParticipantLedgers(client, cast);

    // 100 locks, not the 4,950 a pair set would need — which is more than
    // Postgres's shared lock table holds under the production settings.
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.query).mock.calls[0][1]).toEqual([cast.map((userId) => `ledger:participant:${userId}`)]);
  });
});

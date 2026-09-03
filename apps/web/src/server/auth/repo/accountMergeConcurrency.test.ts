/** Regression for the account-merge claimed-target lock recheck. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const { queryMock, queryOneMock, transactionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  queryOneMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/server/common/db", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  transaction: transactionMock,
}));

import { mergeAccounts } from "./accountMerge.repo";

/** Transaction client whose query sequence is controlled by each test. */
const client = { query: vi.fn() } as unknown as PoolClient;

beforeEach(() => {
  vi.clearAllMocks();
  transactionMock.mockImplementation(
    async (operation: (transactionClient: PoolClient) => Promise<unknown>) => operation(client),
  );
});

describe("account merge target locking", () => {
  it("aborts before any repoint when the invited row was claimed", async () => {
    vi.mocked(client.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "keeper" }, { id: "loser" }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await expect(mergeAccounts("keeper", "loser", "+16175551212", { adoptPhone: true })).rejects.toThrow(
      "target changed",
    );

    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("pg_advisory_xact_lock"),
      ["friend-request-inbox:keeper"],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("pg_advisory_xact_lock"),
      ["friend-request-inbox:loser"],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("ORDER BY id FOR UPDATE"),
      [["keeper", "loser"]],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("password_hash IS NULL"),
      ["loser", "+16175551212"],
    );
  });
});

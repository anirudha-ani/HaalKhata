/** Tests for the time limits every ledger transaction runs under, and how running out of time is answered. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const { client } = vi.hoisted(() => ({ client: { query: vi.fn() } }));

vi.mock("@/server/common/db/db", () => ({
  transaction: (operation: (transactionClient: PoolClient) => Promise<unknown>) =>
    operation(client as unknown as PoolClient),
}));

import { UsecaseError } from "@/server/common/errors";
import {
  LEDGER_BUSY_MESSAGE,
  LEDGER_LOCK_TIMEOUT_MS,
  LEDGER_STATEMENT_TIMEOUT_MS,
} from "./ledgerLocks.constants";
import { withLedgerTransaction } from "./ledgerLocks";

/**
 * An error shaped like the one pg raises for a Postgres error code.
 *
 * @param code - The SQLSTATE.
 * @returns The error.
 */
function postgresError(code: string): Error {
  return Object.assign(new Error(`postgres ${code}`), { code });
}

beforeEach(() => {
  client.query.mockReset();
  client.query.mockResolvedValue({ rows: [] });
});

describe("withLedgerTransaction", () => {
  it("sets its lock and statement limits for this transaction only, before anything else", async () => {
    await withLedgerTransaction(async (transactionClient) => transactionClient.query("SELECT 1"));

    expect(client.query.mock.calls[0]).toEqual([
      expect.stringMatching(/set_config\('lock_timeout', \$1, true\), set_config\('statement_timeout', \$2, true\)/),
      [`${LEDGER_LOCK_TIMEOUT_MS}ms`, `${LEDGER_STATEMENT_TIMEOUT_MS}ms`],
    ]);
    expect(client.query.mock.calls[1]).toEqual(["SELECT 1"]);
  });

  it("answers a lock wait that ran out of time with a message saying nothing was saved", async () => {
    const outcome = withLedgerTransaction(async () => {
      throw postgresError("55P03");
    });

    await expect(outcome).rejects.toBeInstanceOf(UsecaseError);
    await expect(outcome).rejects.toMatchObject({ code: "unavailable", message: LEDGER_BUSY_MESSAGE });
  });

  it("answers a statement that ran out of time the same way", async () => {
    await expect(
      withLedgerTransaction(async () => {
        throw postgresError("57014");
      }),
    ).rejects.toMatchObject({ code: "unavailable", message: LEDGER_BUSY_MESSAGE });
  });

  it("passes any other error through untouched", async () => {
    const failure = postgresError("23505");

    await expect(
      withLedgerTransaction(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
});

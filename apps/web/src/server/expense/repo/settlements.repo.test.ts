/** Regression tests for settlement-history guards around expense mutation. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

vi.mock("@/server/common/db", () => ({
  newId: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
}));
vi.mock("@/server/common/ledgerLocks", () => ({
  lockParticipantLedgers: vi.fn(),
  withLedgerTransaction: vi.fn(),
}));

import { queryOne } from "@/server/common/db";
import { scopeHasSettlements } from "./settlements.repo";

const EVENT_ORDER = "42";
const transactionClient = {} as PoolClient;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queryOne).mockResolvedValue(undefined);
});

describe("settlement history mutation guard", () => {
  it("only considers group settlements ordered after the expense", async () => {
    await scopeHasSettlements("group-trip", [], EVENT_ORDER, transactionClient);

    const [statement, values, client] = vi.mocked(queryOne).mock.calls[0];
    expect(statement).toContain("group_id = $1 AND deleted_at IS NULL AND ledger_event_order > $2");
    expect(values).toEqual(["group-trip", EVENT_ORDER, false, []]);
    expect(client).toBe(transactionClient);
  });

  it("narrows a group scope to the expense's own participants when asked", async () => {
    await scopeHasSettlements(
      "group-trip",
      ["user-a", "user-a", "user-b"],
      EVENT_ORDER,
      transactionClient,
      true,
    );

    const [statement, values] = vi.mocked(queryOne).mock.calls[0];
    expect(statement).toContain("from_user = ANY($4::text[]) OR to_user = ANY($4::text[])");
    expect(values).toEqual(["group-trip", EVENT_ORDER, true, ["user-a", "user-b"]]);
  });

  it("checks later one-off settlements between any affected participants", async () => {
    await scopeHasSettlements(
      null,
      ["user-b", "user-a", "user-b"],
      EVENT_ORDER,
      transactionClient,
    );

    const [statement, values, client] = vi.mocked(queryOne).mock.calls[0];
    expect(statement).toContain("group_id IS NULL");
    expect(statement).toContain("ledger_event_order > $2");
    expect(values).toEqual([["user-b", "user-a"], EVENT_ORDER]);
    expect(client).toBe(transactionClient);
  });

  it("skips a one-person scope because no pair settlement can exist", async () => {
    await expect(
      scopeHasSettlements(null, ["user-a"], EVENT_ORDER, transactionClient),
    ).resolves.toBe(false);
    expect(queryOne).not.toHaveBeenCalled();
  });
});

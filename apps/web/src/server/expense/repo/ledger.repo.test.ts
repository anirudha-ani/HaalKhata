/** Unit tests for the batched per-group net query. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

vi.mock("@/server/common/db/db", () => ({ query: vi.fn(), queryOne: vi.fn() }));

import { query, queryOne } from "@/server/common/db/db";
import { hasUnsettledGroupBalances, sumUserNetByGroup } from "./ledger.repo";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hasUnsettledGroupBalances", () => {
  it.each([undefined, { unsettled: 1 }])("checks eligibility with one bounded query on the locked client", async (result) => {
    const client = {} as PoolClient;
    vi.mocked(queryOne).mockResolvedValue(result);
    expect(await hasUnsettledGroupBalances("trip", client)).toBe(result !== undefined);
    expect(queryOne).toHaveBeenCalledTimes(1);
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("LIMIT 1"), ["trip"], client);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("sumUserNetByGroup", () => {
  it("asks the database once for every group and reads bigint sums back as numbers", async () => {
    vi.mocked(query).mockResolvedValue([
      { group_id: "goa", currency: "INR", net: "-2500" },
      { group_id: "flat", currency: "USD", net: "800" },
    ]);
    const nets = await sumUserNetByGroup("me", ["goa", "flat", "quiet"]);
    expect(query).toHaveBeenCalledTimes(1);
    const [statement, params] = vi.mocked(query).mock.calls[0];
    expect(statement).toMatch(/deleted_at IS NULL/);
    expect(statement).toMatch(/GROUP BY movement\.group_id, movement\.currency/);
    expect(params).toEqual(["me", ["goa", "flat", "quiet"]]);
    // A group with no rows involving the user is simply absent — zero by omission.
    expect(nets).toEqual(
      new Map([
        ["goa", new Map([["INR", -2500]])],
        ["flat", new Map([["USD", 800]])],
      ]),
    );
  });

  it("keeps a group's currencies apart rather than adding them", async () => {
    // A dollar owed and a euro paid back, in one group: two
    // balances, never one zero.
    vi.mocked(query).mockResolvedValue([
      { group_id: "goa", currency: "USD", net: "-100" },
      { group_id: "goa", currency: "EUR", net: "100" },
    ]);
    expect(await sumUserNetByGroup("me", ["goa"])).toEqual(
      new Map([["goa", new Map([["USD", -100], ["EUR", 100]])]]),
    );
  });

  it("does not query at all for no groups", async () => {
    expect(await sumUserNetByGroup("me", [])).toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });
});

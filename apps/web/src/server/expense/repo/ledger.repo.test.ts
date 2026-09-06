/** Unit tests for the batched per-group net query. */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/common/db", () => ({ query: vi.fn() }));

import { query } from "@/server/common/db";
import { sumUserNetByGroup } from "./ledger.repo";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sumUserNetByGroup", () => {
  it("asks the database once for every group and reads bigint sums back as numbers", async () => {
    vi.mocked(query).mockResolvedValue([
      { group_id: "goa", net: "-2500" },
      { group_id: "flat", net: "800" },
    ]);
    const nets = await sumUserNetByGroup("me", ["goa", "flat", "quiet"]);
    expect(query).toHaveBeenCalledTimes(1);
    const [statement, params] = vi.mocked(query).mock.calls[0];
    expect(statement).toMatch(/deleted_at IS NULL/);
    expect(params).toEqual(["me", ["goa", "flat", "quiet"]]);
    // A group with no rows involving the user is simply absent — zero by omission.
    expect(nets).toEqual(
      new Map([
        ["goa", -2500],
        ["flat", 800],
      ]),
    );
  });

  it("does not query at all for no groups", async () => {
    expect(await sumUserNetByGroup("me", [])).toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });
});

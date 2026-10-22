/** Tests archive pathways and eligibility shared by both expense pickers and group screens. */

import { describe, expect, it } from "vitest";
import { allBalancesSettled, groupsByStatus } from "./archiving";
import { GroupStatus } from "./status";

describe("group archive pathways", () => {
  const summaries = [
    { group: { id: "active", status: GroupStatus.ACTIVE } },
    { group: { id: "archived", status: GroupStatus.ARCHIVED } },
    { group: { id: "deleted", status: GroupStatus.DELETED } },
    { group: { id: "unknown", status: 999 as GroupStatus } },
    { group: { id: "old-cache" } },
    {},
  ];

  it("keeps archived groups out of active lists and expense selectors", () => {
    expect(groupsByStatus(summaries).map((summary) => summary.group?.id)).toEqual([
      "active", "old-cache",
    ]);
  });

  it("keeps archived history accessible through its own pathway", () => {
    expect(groupsByStatus(summaries, GroupStatus.ARCHIVED).map((summary) => summary.group?.id)).toEqual([
      "archived",
    ]);
  });

  it("excludes deleted and unknown states from both visible pathways", () => {
    const visible = [
      ...groupsByStatus(summaries, GroupStatus.ACTIVE),
      ...groupsByStatus(summaries, GroupStatus.ARCHIVED),
    ];
    expect(visible.some((summary) => summary.group?.id === "deleted")).toBe(false);
    expect(visible.some((summary) => summary.group?.id === "unknown")).toBe(false);
  });
});

describe("archive eligibility", () => {
  it("requires loaded balances before enabling the action", () => {
    expect(allBalancesSettled(undefined)).toBe(false);
  });

  it("checks other members even when the viewer is settled", () => {
    expect(allBalancesSettled([{ netCents: 0 }, { netCents: 100 }, { netCents: -100 }])).toBe(false);
  });

  it("allows an empty or completely settled group", () => {
    expect(allBalancesSettled([])).toBe(true);
    expect(allBalancesSettled([{ netCents: 0 }, { netCents: 0 }])).toBe(true);
  });
});

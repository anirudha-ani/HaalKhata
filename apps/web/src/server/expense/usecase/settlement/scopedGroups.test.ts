/** Scope selection preserves payment boundaries and reads large selections only linearly. */

import { expect, it } from "vitest";
import { MAX_GROUPS_PER_PERSON } from "@/server/group/group.constants";
import { filterSettlementGroups } from "./scopedGroups";

const LARGE_SELECTION_SIZE = 50_000;
const SHARED_GROUPS = Object.freeze([
  { id: "trip-first", name: "First trip", simplify_debts: false },
  { id: "trip-second", name: "Second trip", simplify_debts: true },
  { id: "trip-third", name: "Third trip", simplify_debts: false },
]);

it("keeps every shared group and its metadata when no scopes were selected", () => {
  expect(filterSettlementGroups(SHARED_GROUPS, [])).toEqual(SHARED_GROUPS);
});

it("keeps shared order without widening the selection or duplicating groups", () => {
  const selection = Object.freeze(["trip-third", "unknown-trip", "", "trip-first", "trip-third"]);
  expect(filterSettlementGroups(SHARED_GROUPS, selection)).toEqual([SHARED_GROUPS[0], SHARED_GROUPS[2]]);
  expect(selection).toEqual(["trip-third", "unknown-trip", "", "trip-first", "trip-third"]);
});

it("does not include a group for direct-only or entirely unknown scopes", () => {
  expect(filterSettlementGroups(SHARED_GROUPS, ["", ""])).toEqual([]);
  expect(filterSettlementGroups(SHARED_GROUPS, ["unknown-trip"])).toEqual([]);
  expect(filterSettlementGroups([], ["trip-first"])).toEqual([]);
});

it("bounds selection reads by input size even at the shared-group limit", () => {
  const groups = Array.from({ length: MAX_GROUPS_PER_PERSON }, (_entry, index) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`,
    name: `Trip ${index}`,
  }));
  const values = Array<string>(LARGE_SELECTION_SIZE).fill("aaaaaaaa-aaaa-4aaa-8aaa-999999999999");
  values[values.length - 2] = groups[0].id;
  values[values.length - 1] = groups[groups.length - 1].id;
  // This measures observable input work, not an implementation method or wall clock.
  // Fail early if a regression would otherwise perform millions of array reads.
  const budget = 2 * (values.length + groups.length);
  let reads = 0;
  const selection = new Proxy(values, {
    /**
     * Counts accesses to supplied ids while preserving ordinary array behavior.
     * @param target Backing request selection.
     * @param property Array index or ordinary array member.
     * @param receiver Proxy used by array iteration and lookup methods.
     * @returns The requested array value unless its work budget was exceeded.
     */
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) {
        reads++;
        if (reads > budget) throw new Error("scope selection repeatedly scans its input");
      }
      return Reflect.get(target, property, receiver);
    },
  });
  expect(filterSettlementGroups(groups, selection)).toEqual([groups[0], groups[groups.length - 1]]);
  expect(reads).toBeLessThanOrEqual(budget);
});

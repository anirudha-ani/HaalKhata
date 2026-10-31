/** @vitest-environment jsdom */
/** A tap on a live split shows at once, goes to the server in order, and is said out loud if it fails. */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeLine, setOnLine } from "@haalkhata/shared/expense/live/liveEdits";
import { useLiveSplit } from "./useLiveSplit";
import { useLiveSplitAPI } from "./useLiveSplitAPI";

const SARA = "user-sara";
const TOMAS = "user-tomas";

vi.mock("./useLiveSplitAPI", () => ({ useLiveSplitAPI: vi.fn() }));
vi.mock("@/lib/api/connect", () => ({ errorMessage: (error: Error) => error.message }));

/** A bill Sara paid, with nobody on either line. */
const expense = {
  id: "dinner",
  groupId: "",
  description: "Dinner",
  category: "food",
  expenseDate: "2026-10-30",
  notes: "",
  splitType: "itemized",
  amountCents: 2800,
  currency: "USD",
  taxCents: 0,
  tipCents: 0,
  deletedAt: "",
  version: 1,
  payers: [{ userId: SARA, amountCents: 2800 }],
  splits: [{ userId: SARA, owedCents: 2800 }],
  items: [
    { id: "pizza", name: "Pizza", quantity: 1, totalCents: 2000, assignments: [] },
    { id: "beer", name: "Beer", quantity: 1, totalCents: 800, assignments: [] },
  ],
};

let root: Root;
let container: HTMLDivElement;
let live: ReturnType<typeof useLiveSplit>;
const saveEdit = vi.fn();

/**
 * Keeps what the hook returned on this render.
 *
 * @param rendered - What it returned.
 */
function remember(rendered: ReturnType<typeof useLiveSplit>) {
  live = rendered;
}

/**
 * Renders nothing; runs the hook the way the page does.
 *
 * @returns Nothing.
 */
function Harness() {
  remember(useLiveSplit("dinner"));
  return null;
}

/**
 * Mounts the page's state with the split ending when given.
 *
 * @param endsAt - When it ends.
 */
async function open(endsAt = new Date(Date.now() + 20 * 60_000).toISOString()) {
  vi.mocked(useLiveSplitAPI).mockReturnValue({
    me: { id: TOMAS, name: "Tomas" },
    detail: {
      expense,
      liveSplit: { token: "token", hostId: SARA, endsAt, peopleIds: [SARA, TOMAS] },
      users: [{ id: SARA, name: "Sara Lund" }, { id: TOMAS, name: "Tomas Berg" }],
    },
    isLoading: false,
    accessEnded: false,
    readError: null,
    saveEdit,
    finish: { mutate: vi.fn(), isPending: false },
    markBalancesStale: vi.fn(),
  } as never);
  await act(async () => root.render(createElement(Harness)));
}

/** @returns Waits for the queue to run. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  saveEdit.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("a live split's screen", () => {
  it("shows a tap before the server has answered", async () => {
    saveEdit.mockReturnValue(new Promise(() => undefined));
    await open();

    await act(async () => live.apply(setOnLine("pizza", TOMAS, true)));

    expect(live.state?.lines[0].shares).toEqual({ [TOMAS]: 1 });
    expect(live.summary?.myShareCents).toBe(2000);
  });

  it("sends taps one at a time, in the order they were made", async () => {
    const order: string[] = [];
    const first = Promise.withResolvers<void>();
    saveEdit.mockImplementationOnce(async () => {
      order.push("pizza");
      await first.promise;
    }).mockImplementationOnce(async () => {
      order.push("beer");
    });
    await open();

    await act(async () => {
      live.apply(setOnLine("pizza", TOMAS, true));
      live.apply(setOnLine("beer", TOMAS, true));
    });
    await settle();
    expect(order).toEqual(["pizza"]);

    first.resolve();
    await settle();
    expect(order).toEqual(["pizza", "beer"]);
  });

  it("says when a tap failed, and goes back to the bill as saved", async () => {
    saveEdit.mockRejectedValue(new Error("HaalKhata could not be reached"));
    await open();

    await act(async () => live.apply(setOnLine("pizza", TOMAS, true)));
    await settle();

    expect(live.error).toBe("HaalKhata could not be reached");
    expect(live.state?.lines[0].shares).toEqual({});
  });

  it("says why a change cannot be made, without sending it", async () => {
    await open();

    await act(async () => live.apply((state) => removeLine("beer")(removeLine("pizza")(state))));

    expect(live.error).not.toBe("");
    expect(saveEdit).not.toHaveBeenCalled();
  });

  it("says how long is left, and who is here", async () => {
    await open();

    expect(live.isOpen).toBe(true);
    expect(live.timeLeft).toBe("20 min left");
    expect(live.castIds).toEqual([SARA, TOMAS]);
    expect(live.isHost).toBe(false);
  });

  it("stops offering changes once its time is up", async () => {
    await open(new Date(Date.now() - 1000).toISOString());

    expect(live.isOpen).toBe(false);
    expect(live.timeLeft).toBe("");
  });
});

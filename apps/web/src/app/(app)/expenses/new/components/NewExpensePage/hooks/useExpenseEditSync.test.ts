/** @vitest-environment jsdom */
/** An open edit form takes in what somebody else saves, holds what collides until it is answered, and turns a refused save into that choice. */

import { Code, ConnectError } from "@connectrpc/connect";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Expense } from "@haalkhata/shared/api/plainMessages";
import { expenseStateOf, type ExpenseState } from "@haalkhata/shared/expense/merge/expenseState";
import { useExpenseEditSync, type TakenChanges } from "./useExpenseEditSync";

const SARA = "user-sara";
const TOMAS = "user-tomas";

/** The expense as the form opened it. */
const opened = {
  id: "dinner",
  description: "Dinner",
  category: "food",
  expenseDate: "2026-10-29",
  notes: "",
  splitType: "equal",
  amountCents: 1000,
  taxCents: 0,
  tipCents: 0,
  version: 1,
  updatedBy: "",
  payers: [{ userId: SARA, amountCents: 1000 }],
  splits: [{ userId: TOMAS, owedCents: 500 }, { userId: SARA, owedCents: 500 }],
  items: [],
} as unknown as Expense;

let root: Root;
let container: HTMLDivElement;
let sync: ReturnType<typeof useExpenseEditSync>;
let form: ExpenseState;
let latest: Expense;
let savedVersion: number;
const takeIn = vi.fn<(taken: TakenChanges) => void>();

/**
 * Keeps what the hook returned on this render.
 *
 * @param rendered - What it returned.
 */
function remember(rendered: ReturnType<typeof useExpenseEditSync>) {
  sync = rendered;
}

/**
 * Renders nothing; runs the hook the way the form does.
 *
 * @returns Nothing.
 */
function Harness() {
  remember(useExpenseEditSync({
    opened,
    savedVersion,
    versionCheckedAt: savedVersion,
    myId: SARA,
    isSaving: false,
    currency: "USD",
    readLatest: async () => ({ expense: latest, users: [{ id: TOMAS, name: "Tomas Berg" }] }),
    readForm: () => form,
    takeIn,
  }));
  return null;
}

/** @returns Waits for a catch-up to finish and the hook to re-render. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * The server reports a new version, as the timer would find it.
 *
 * @param saved - The expense as now saved.
 */
async function somebodySaves(saved: Partial<Expense>) {
  latest = { ...opened, version: opened.version + 1, updatedBy: TOMAS, ...saved } as Expense;
  savedVersion = latest.version;
  await act(async () => root.render(createElement(Harness)));
  await settle();
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  takeIn.mockClear();
  form = expenseStateOf(opened);
  latest = opened;
  savedVersion = opened.version;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Harness)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("an open edit form", () => {
  it("does nothing while nobody else has saved", async () => {
    await settle();

    expect(takeIn).not.toHaveBeenCalled();
    expect(sync.note).toBe("");
  });

  it("takes in a change this person left alone, and says whose it was", async () => {
    await somebodySaves({ expenseDate: "2026-10-28" });

    expect(takeIn).toHaveBeenCalledOnce();
    expect([...takeIn.mock.calls[0][0].parts]).toEqual(["expenseDate"]);
    expect(sync.note).toBe("Tomas changed the date.");
    expect(sync.base?.version).toBe(2);
    expect(sync.conflicts).toEqual([]);
  });

  it("asks about a part both changed, and leaves the form as it is until answered", async () => {
    form = { ...form, description: "Supper" };

    await somebodySaves({ description: "Birthday dinner" });

    expect(takeIn).not.toHaveBeenCalled();
    expect(sync.conflicts.map((entry) => entry.text)).toEqual([
      "Tomas renamed this to “Birthday dinner”. You have “Supper”.",
    ]);
    expect(sync.changedBy).toBe("Tomas");
  });

  it("clears a conflict kept as it is, changing nothing in the form", async () => {
    form = { ...form, description: "Supper" };
    await somebodySaves({ description: "Birthday dinner" });

    await act(async () => sync.keepMine(sync.conflicts[0].conflict));

    expect(sync.conflicts).toEqual([]);
    expect(takeIn).not.toHaveBeenCalled();
  });

  it("puts the saved value in the form when that is the answer", async () => {
    form = { ...form, description: "Supper" };
    await somebodySaves({ description: "Birthday dinner" });

    await act(async () => sync.takeSaved(sync.conflicts[0].conflict));

    expect(sync.conflicts).toEqual([]);
    expect(takeIn.mock.calls[0][0].merged.description).toBe("Birthday dinner");
    expect([...takeIn.mock.calls[0][0].parts]).toEqual(["description"]);
  });

  it("turns a save refused for a collision into the same choice", async () => {
    form = { ...form, description: "Supper" };
    latest = { ...opened, version: 2, updatedBy: TOMAS, description: "Birthday dinner" } as Expense;

    let shown = false;
    await act(async () => {
      shown = await sync.answerRefusedSave(new ConnectError("changed", Code.Aborted));
    });

    expect(shown).toBe(true);
    expect(sync.conflicts).toHaveLength(1);
  });

  it("leaves any other failure for the form to report", async () => {
    await expect(sync.answerRefusedSave(new ConnectError("no", Code.PermissionDenied))).resolves.toBe(false);
    await expect(sync.answerRefusedSave(new Error("network"))).resolves.toBe(false);
  });
});

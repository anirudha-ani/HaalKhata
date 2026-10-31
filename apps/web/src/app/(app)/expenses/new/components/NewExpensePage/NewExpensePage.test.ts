/** @vitest-environment jsdom */
/** The edit form never opens without the expense it edits: a blank one would replace what is saved. */

import { Code, ConnectError } from "@connectrpc/connect";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewExpensePage } from "./NewExpensePage";
import { useNewExpenseAPI } from "./hooks/useNewExpenseAPI";

vi.mock("./hooks/useNewExpenseAPI", () => ({ useNewExpenseAPI: vi.fn() }));
vi.mock("./components/ExpenseForm/ExpenseForm", () => ({ ExpenseForm: () => "the form" }));
vi.mock("@/lib/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/lib/api/connect", () => ({ errorMessage: (error: Error) => error.message }));
vi.mock("../../utils/initialValues", () => ({ buildInitialValues: () => ({}) }));

const loaded = { me: { id: "sara" }, archivedGroups: [], isLoading: false, loadError: null, retry: vi.fn() };
let root: Root;
let container: HTMLDivElement;

/**
 * Renders the page with a given read state.
 *
 * @param reads - What the hook returns.
 * @param editExpenseId - The expense being edited, or "" for a new one.
 */
async function open(reads: object, editExpenseId = "expense-1") {
  vi.mocked(useNewExpenseAPI).mockReturnValue(reads as never);
  await act(async () => {
    root.render(createElement(NewExpensePage, { editExpenseId, initialFriendId: "", initialGroupId: "" }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("NewExpensePage", () => {
  it("says the expense could not be loaded instead of opening a blank form", async () => {
    await open({ ...loaded, editing: undefined, loadError: new ConnectError("try again", Code.Unavailable) });

    expect(container.textContent).toContain("This expense could not be loaded");
    expect(container.textContent).not.toContain("the form");
  });

  it("offers a way to try again", async () => {
    const retry = vi.fn();
    await open({ ...loaded, editing: undefined, loadError: new Error("offline"), retry });

    await act(async () => container.querySelector("button")?.click());

    expect(retry).toHaveBeenCalledOnce();
  });

  it("does not leave a failed read of the account on a spinner for ever", async () => {
    await open({ ...loaded, me: undefined, loadError: new Error("offline") }, "");

    expect(container.textContent).toContain("could not be loaded");
  });

  it("opens the form once the expense is there", async () => {
    await open({ ...loaded, editing: { expense: { id: "expense-1" } } });

    expect(container.textContent).toContain("the form");
  });
});

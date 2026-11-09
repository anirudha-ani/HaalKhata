/** @vitest-environment jsdom */
/** A failed history page keeps its actual retry control in view without an opening jump. */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useExpenseDetail } from "./hooks/useExpenseDetail";
import { ExpenseDetailPage } from "./ExpenseDetailPage";

vi.mock("./hooks/useExpenseDetail", () => ({ useExpenseDetail: vi.fn() }));
vi.mock("@/lib/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("./components/RepaymentCard/RepaymentCard", () => ({ RepaymentCard: () => null }));
let root: Root;
let container: HTMLDivElement;
const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  scrollIntoView.mockClear();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

/** @param error Error newly inserted above the history retry button. */
function render(error: string) {
  vi.mocked(useExpenseDetail).mockReturnValue({
    detail: { expense: { id: "bill", description: "Dinner", amountCents: 100, currency: "USD",
      expenseDate: "2026-11-09", groupId: "", deletedAt: "", createdBy: "owner", category: "food",
      splitType: "exact", payers: [], splits: [], items: [], notes: "", taxCents: 0, tipCents: 0 } },
    me: { id: "viewer" }, userById: new Map(), history: [], changes: [], comments: [],
    hasEarlierHistory: true, earlierHistoryError: error, isLoadingEarlierHistory: false,
    earlierCommentsError: "", hasEarlierComments: false, comment: "", isLoading: false,
    showEarlierHistory: vi.fn(),
  } as unknown as ReturnType<typeof useExpenseDetail>);
  act(() => root.render(createElement(ExpenseDetailPage, { expenseId: "bill" })));
}

it("reveals the history retry button when its error pushes it below the viewport", () => {
  render("");
  expect(scrollIntoView).not.toHaveBeenCalled();
  render("Offline");
  const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Show earlier changes");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load earlier changes: Offline");
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  expect(scrollIntoView.mock.contexts).toEqual([retry]);
});

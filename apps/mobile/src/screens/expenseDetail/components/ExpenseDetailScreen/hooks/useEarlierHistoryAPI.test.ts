/** @vitest-environment jsdom */
/** Real history paging behavior: opt-in reads, retry feedback and boundary resets. */
import { create } from "@bufbuild/protobuf";
import { ListExpenseHistoryResponseSchema } from "@haalkhata/protogen/expense/v1/expense_pb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { expenseClient } from "@/lib/api/connect";
import { useEarlierHistoryAPI } from "./useEarlierHistoryAPI";

vi.mock("@/lib/api/connect", () => ({ expenseClient: { listExpenseHistory: vi.fn() }, errorMessage: (error: Error) => error.message }));
let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
let latest: ReturnType<typeof useEarlierHistoryAPI>;

/** @param props Active bill and first-page boundary. @returns A hook harness. */
function Harness(props: { expenseId: string; cursor: string }) {
  const state = useEarlierHistoryAPI(props.expenseId, props.cursor);
  useEffect(() => { latest = state; });
  return null;
}
/** @param expenseId Active bill. @param cursor Current boundary. */
async function render(expenseId = "first-bill", cursor = "newest") {
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Harness, { expenseId, cursor }))));
}
/** Flushes query notifications into React. */
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }

beforeEach(async () => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  vi.mocked(expenseClient.listExpenseHistory).mockImplementation(async ({ cursor }) => create(ListExpenseHistoryResponseSchema, {
    history: [{ id: cursor === "newest" ? "middle" : "oldest", type: "expense_updated", createdAt: "2026-11-09T00:00:00Z" }],
    nextCursor: cursor === "newest" ? "older" : "",
  }));
  await render();
});
afterEach(() => { act(() => root.unmount()); container.remove(); queryClient.clear(); vi.unstubAllGlobals(); });

it("reads on demand, preserves loaded changes, and resets when the bill or boundary changes", async () => {
  expect(expenseClient.listExpenseHistory).not.toHaveBeenCalled();
  await act(async () => latest.showEarlier()); await settle();
  expect(latest.history.map((event) => event.id)).toEqual(["middle"]);
  await act(async () => latest.showEarlier()); await settle();
  expect(latest.history.map((event) => event.id)).toEqual(["oldest", "middle"]);
  expect(latest.hasEarlier).toBe(false);
  await render("second-bill");
  expect(latest.history).toEqual([]);
  expect(latest.hasEarlier).toBe(true);
  expect(expenseClient.listExpenseHistory).toHaveBeenCalledTimes(2);
  await act(async () => latest.showEarlier()); await settle();
  await render("second-bill", "changed-boundary");
  expect(latest.history).toEqual([]);
  expect(expenseClient.listExpenseHistory).toHaveBeenCalledTimes(3);
});

it("keeps a failed page retryable and exposes its error beside the control", async () => {
  vi.mocked(expenseClient.listExpenseHistory).mockRejectedValueOnce(new Error("History temporarily unavailable"));
  await act(async () => latest.showEarlier()); await settle();
  expect(latest.earlierError).toBe("History temporarily unavailable");
  expect(latest.hasEarlier).toBe(true);
  await act(async () => latest.showEarlier()); await settle();
  expect(latest.earlierError).toBe("");
  expect(latest.history).toHaveLength(1);
});

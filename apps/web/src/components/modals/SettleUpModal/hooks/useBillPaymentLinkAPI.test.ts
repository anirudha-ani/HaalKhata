/** @vitest-environment jsdom */
/** A payment handoff cannot reuse a bill read that started before the tap. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { expenseClient } from "@/lib/api/connect";
import { useBillPaymentLinkAPI } from "./useBillPaymentLinkAPI";

vi.mock("@/lib/api/connect", () => ({ expenseClient: { getExpense: vi.fn() } }));

it("refuses an old $30 handoff while an earlier background bill read is still in flight", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const cache = new QueryClient();
  const root = createRoot(document.createElement("div"));
  let check!: (amountCents: number) => Promise<void>;
  /** Mount the hook with the same query cache used by the detail page. */
  function Handoff() {
    const mutation = useBillPaymentLinkAPI("dinner", "ana");
    useEffect(() => { check = mutation.mutateAsync; }, [mutation.mutateAsync]);
    return null;
  }
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client: cache }, createElement(Handoff))));
    const detailKey = queryKeys.expense("dinner");
    const detail = (payableCents: number) => ({
      expense: { currency: "USD" }, repayments: [{ userId: "ana", refusal: "", payableCents }],
    }) as Awaited<ReturnType<typeof expenseClient.getExpense>>;
    let finishOld!: () => void;
    const background = cache.fetchQuery({ queryKey: detailKey, queryFn: () =>
      new Promise<ReturnType<typeof detail>>((resolve) => { finishOld = () => resolve(detail(3000)); }),
    }).catch(() => undefined);
    vi.mocked(expenseClient.getExpense).mockResolvedValue(detail(2000));
    await act(async () => {
      const request = check(3000);
      const refused = expect(request).rejects.toThrow("more than the $20.00");
      await vi.waitFor(() => expect(expenseClient.getExpense).toHaveBeenCalledOnce());
      finishOld();
      await refused;
      await background;
    });
    expect(cache.getQueryData(detailKey)).toEqual(detail(2000));
  } finally {
    await act(async () => root.unmount());
    cache.clear();
    vi.unstubAllGlobals();
  }
});

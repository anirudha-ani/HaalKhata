/** @vitest-environment jsdom */
/** A period that fails to load leaves the last one on screen, named as such, and asking again retries it. */

import { create } from "@bufbuild/protobuf";
import { GetInsightsResponseSchema } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { personalAnalyticsClient } from "@/lib/api/connect";
import { useInsights } from "./useInsights";

vi.mock("@/lib/api/connect", () => ({
  personalAnalyticsClient: { getInsights: vi.fn() },
  errorMessage: (error: Error) => error.message,
}));

const SIX_MONTHS = create(GetInsightsResponseSchema, {
  journey: { memberSince: "2026-01-04T10:00:00.000Z", expenseCount: 42 },
  months: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
  currencies: [{ currency: "USD", shareCents: 12000 }],
});

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
let latest: ReturnType<typeof useInsights>;

/**
 * Renders nothing; hands the hook's latest answer to the test.
 *
 * @param props - Where to send each answer.
 * @returns Nothing.
 */
function Harness({ report }: { report: (state: ReturnType<typeof useInsights>) => void }) {
  report(useInsights(true));
  return null;
}

/** Lets pending promises and React updates settle. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(personalAnalyticsClient.getInsights).mockImplementation(async ({ months }) => {
    if (months === 12) throw new Error("Network down");
    return SIX_MONTHS;
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Harness, { report: (state) => (latest = state) }),
      ),
    ),
  );
  await settle();
  await act(async () => latest.setRange(12));
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
});

it("keeps the last period, lifetime figures included, and names both periods", () => {
  expect(latest.insights?.journey?.expenseCount).toBe(42);
  expect(latest.insights?.months).toHaveLength(6);
  expect(latest.range).toBe(6);
  expect(latest.error).toBe("Couldn't load the last year: Network down. Showing the last 6 months.");
});

it("asks again when the failed period is chosen again, and goes back without an error", async () => {
  const askedBefore = vi.mocked(personalAnalyticsClient.getInsights).mock.calls.length;
  await act(async () => latest.setRange(12));
  await settle();
  expect(vi.mocked(personalAnalyticsClient.getInsights).mock.calls.length).toBe(askedBefore + 1);

  await act(async () => latest.setRange(6));
  await settle();
  expect(latest.range).toBe(6);
  expect(latest.error).toBe("");
});

/** @vitest-environment jsdom */
/** The report queue keeps a card's failure until something on that card replaces it. */

import { create } from "@bufbuild/protobuf";
import { ReportQueueSchema } from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { adminModerationClient } from "@/lib/api/adminConnect";
import { useAdminModerationAPI } from "./useAdminModerationAPI";
import { useReportQueue } from "./useReportQueue";

vi.mock("@/lib/api/adminConnect", () => ({
  adminModerationClient: {
    listReports: vi.fn(),
    dismissReport: vi.fn(),
    removeReportedContent: vi.fn(),
    suspendAuthor: vi.fn(),
    resumeAuthor: vi.fn(),
  },
}));
vi.mock("@/lib/api/connect", () => ({ errorMessage: (error: Error) => error.message }));

const QUEUE = create(ReportQueueSchema, {
  reports: [
    { reportId: "report-card-a", targetKind: "comment", reportCount: 1 },
    { reportId: "report-card-b", targetKind: "expense", reportCount: 1 },
  ],
});

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
let latest: ReturnType<typeof useReportQueue>;

/**
 * Renders nothing; hands the hook's latest answer to the test.
 *
 * @param props - Where to send each answer.
 * @returns Nothing.
 */
function Harness({ report }: { report: (state: ReturnType<typeof useReportQueue>) => void }) {
  report(useReportQueue(useAdminModerationAPI()));
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
  vi.mocked(adminModerationClient.listReports).mockResolvedValue(QUEUE);
  vi.mocked(adminModerationClient.dismissReport).mockRejectedValue(new Error("the server is down"));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Harness, { report: (state) => (latest = state) }))),
  );
  await settle();
  await act(async () => latest.run("report-card-a", "dismiss"));
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
});

it("keeps a failed dismiss on its card when a question opens on another card", async () => {
  expect(latest.failed).toMatchObject({ reportId: "report-card-a", action: "dismiss" });

  await act(async () => latest.ask("report-card-b", "remove"));

  expect(latest.confirming).toEqual({ reportId: "report-card-b", action: "remove" });
  expect(latest.failed).toMatchObject({ reportId: "report-card-a", action: "dismiss" });
});

it("clears a card's failure when a question opens in place of that card's buttons", async () => {
  await act(async () => latest.ask("report-card-a", "remove"));

  expect(latest.confirming).toEqual({ reportId: "report-card-a", action: "remove" });
  expect(latest.failed).toBeNull();
});

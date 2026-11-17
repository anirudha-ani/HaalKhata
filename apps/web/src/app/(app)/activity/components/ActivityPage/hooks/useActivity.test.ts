/** @vitest-environment jsdom */
/** First-page month metadata survives loading older activity and refreshes with its query. */

import { createPlain } from "@haalkhata/shared/api/wireNumbers";
import { ListActivityResponseSchema } from "@haalkhata/protogen/social/v1/social_pb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { socialClient } from "@/lib/api/connect";
import { useActivity } from "./useActivity";

vi.mock("@/lib/api/connect", () => ({
  socialClient: {
    listActivity: vi.fn(),
    listNotifications: vi.fn(async () => ({ notifications: [], unreadCount: 0, pendingFriendRequestCount: 0 })),
    markNotificationsRead: vi.fn(async () => ({})),
  },
  errorMessage: (error: Error) => error.message,
}));

const MONTHS = ["2026-10", "2026-09"];
let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
let latest: ReturnType<typeof useActivity>;

/**
 * Exposes the hook without rendering a platform-specific view.
 * @param props - Receiver for each settled hook result.
 * @returns Nothing.
 */
function Harness({ report }: { report: (state: ReturnType<typeof useActivity>) => void }) {
  const state = useActivity();
  useEffect(() => { report(state); });
  return null;
}

/**
 * Flushes query notifications and React updates.
 * @returns When scheduled UI updates have settled.
 */
async function settle(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(socialClient.listActivity).mockImplementation(async ({ cursor, month }) => createPlain(ListActivityResponseSchema, {
    events: [{ id: month ? "september" : cursor ? "older" : "newest" }],
    months: cursor ? [] : MONTHS,
    nextCursor: cursor || month ? "" : "older-cursor",
  }));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient },
    createElement(Harness, { report: (state) => { latest = state; } }),
  )));
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

it("keeps months while appending a continuation that carries no metadata", async () => {
  expect(latest.months).toEqual(MONTHS);
  await act(async () => { latest.loadMore(); });
  await settle();
  expect(latest.events.map((event) => event.id)).toEqual(["newest", "older"]);
  expect(latest.months).toEqual(MONTHS);
  expect(latest.hasMore).toBe(false);
});

it("starts a fresh first page when changing months and refreshes its options", async () => {
  await act(async () => { latest.loadMore(); });
  await settle();
  await act(async () => { latest.setMonth("2026-09"); });
  await settle();
  expect(socialClient.listActivity).toHaveBeenLastCalledWith({ groupId: "", cursor: "", month: "2026-09" });
  expect(latest.events.map((event) => event.id)).toEqual(["september"]);
  expect(latest.months).toEqual(MONTHS);
  vi.mocked(socialClient.listActivity).mockResolvedValue(createPlain(ListActivityResponseSchema, {
    events: [{ id: "refreshed" }], months: ["2026-11", ...MONTHS],
  }));
  await act(async () => { latest.retry(); });
  await settle();
  expect(latest.months).toEqual(["2026-11", ...MONTHS]);
  expect(latest.events.map((event) => event.id)).toEqual(["refreshed"]);
});

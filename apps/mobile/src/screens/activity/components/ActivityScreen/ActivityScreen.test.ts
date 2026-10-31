/** @vitest-environment jsdom */
/** A failed read on the activity feed is said in place and never takes away the rows already loaded. */

import { createPlain } from "@haalkhata/shared/api/wireNumbers";
import { ListActivityResponseSchema } from "@haalkhata/protogen/social/v1/social_pb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { socialClient } from "@/lib/api/connect";
import { ActivityScreen } from "./ActivityScreen";

vi.mock("react-native", () => ({
  AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove: () => undefined }) },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  Platform: { OS: "ios", select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  ScrollView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  View: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) =>
    createElement("div", { role: accessibilityRole }, children),
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  TextInput: () => createElement("input"),
  Pressable: ({ children, onPress }: { children: ReactNode; onPress: () => void }) =>
    createElement("button", { onClick: onPress }, children),
  ActivityIndicator: () => createElement("span", null, "Loading"),
}));
vi.mock("lucide-react-native", () => ({
  Bell: () => null,
  ChevronDown: () => null,
  RotateCw: () => null,
  Search: () => null,
  X: () => null,
}));
vi.mock("@/components/ui/Button", () => ({
  Button: ({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) =>
    createElement("button", { onClick: onPress, disabled: busy }, label),
}));
vi.mock("@/components/shell/Screen/Screen", () => ({
  Screen: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));
vi.mock("@/components/shell/DetailHeader/DetailHeader", () => ({ DetailHeader: () => null }));
vi.mock("@/components/activity/ActivityList", () => ({
  ActivityList: ({ events }: { events: { id: string; message: string }[] }) =>
    createElement("ul", null, ...events.map((event) => createElement("li", { key: event.id }, event.message))),
}));
vi.mock("./components/InsightsPanel/InsightsPanel", () => ({ InsightsPanel: () => null }));
vi.mock("@/lib/api/connect", () => ({
  socialClient: { listActivity: vi.fn(), listNotifications: vi.fn(), markNotificationsRead: vi.fn() },
  personalAnalyticsClient: { getInsights: vi.fn() },
  errorMessage: (error: Error) => error.message,
}));

const FIRST_PAGE = createPlain(ListActivityResponseSchema, {
  events: [
    { id: "act-1", type: "expense_added", message: "Oni added Firewood", createdAt: "2026-10-20T10:00:00.000Z" },
    { id: "act-2", type: "settlement", message: "Dot paid Oni $15.00", createdAt: "2026-10-19T10:00:00.000Z" },
  ],
  nextCursor: "page-2",
  months: ["2026-10"],
});

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

/** Lets pending promises and React updates settle. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Renders the screen with its real hooks under a fresh query client. */
async function render() {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(ActivityScreen))),
  );
  await settle();
}

/**
 * Presses the button with exactly this text.
 *
 * @param label - The button's text.
 */
async function press(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) => element.textContent === label);
  expect(button, label).toBeDefined();
  await act(async () => {
    button!.click();
  });
  await settle();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(socialClient.markNotificationsRead).mockResolvedValue({} as never);
  // The screen shows no notifications, so their failing must not touch the feed.
  vi.mocked(socialClient.listNotifications).mockRejectedValue(new Error("Notifications are down"));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
});

it("keeps the loaded rows when the next page fails, and says so above Show me more", async () => {
  vi.mocked(socialClient.listActivity)
    .mockResolvedValueOnce(FIRST_PAGE)
    .mockRejectedValueOnce(new Error("Network down"));
  await render();
  expect(container.textContent).toContain("Oni added Firewood");
  expect(container.querySelector('[role="alert"]')).toBeNull();

  await press("Show me more");

  expect(container.textContent).toContain("Oni added Firewood");
  expect(container.textContent).toContain("Dot paid Oni $15.00");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Couldn't load more: Network down");
  // The button that failed is the retry; the alert offers no second one.
  expect(Array.from(container.querySelectorAll("button")).map((button) => button.textContent)).not.toContain("Try again");
  expect(Array.from(container.querySelectorAll("button")).map((button) => button.textContent)).toContain("Show me more");
});

it("says the feed failed in its place when nothing loaded, and Try again loads it", async () => {
  vi.mocked(socialClient.listActivity)
    .mockRejectedValueOnce(new Error("Network down"))
    .mockResolvedValueOnce(FIRST_PAGE);
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load your activity: Network down");

  await press("Try again");

  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("Oni added Firewood");
});

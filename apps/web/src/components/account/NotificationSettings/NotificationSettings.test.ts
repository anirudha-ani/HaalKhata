/** @vitest-environment jsdom */
/** The web Notifications card: switches save whole records, and every result shows beside its control. */

import { create } from "@bufbuild/protobuf";
import { DeviceSchema, ListDevicesResponseSchema, PushPreferencesSchema } from "@haalkhata/protogen/push/v1/push_pb";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pushClient } from "@/lib/api/connect";
import { NotificationSettings } from "./NotificationSettings";

vi.mock("@/lib/api/connect", () => ({
  pushClient: {
    listDevices: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    removeDevice: vi.fn(),
    sendTestPush: vi.fn(),
  },
  errorMessage: (error: Error) => error.message,
}));

const ALL_ON = create(PushPreferencesSchema, { expenses: true, comments: true, payments: true, groups: true, friends: true });
const PHONE = create(DeviceSchema, {
  id: "dev-1",
  platform: "ios",
  label: "iPhone 17",
  lastSeenAt: "2026-10-15T09:00:00.000Z",
  lastSentAt: "",
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

/**
 * Finds a button by its visible text.
 *
 * @param text - The button's label.
 * @returns The button.
 */
function button(text: string): HTMLButtonElement {
  return [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === text)!;
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(pushClient.getPreferences).mockResolvedValue(ALL_ON);
  vi.mocked(pushClient.listDevices).mockResolvedValue(create(ListDevicesResponseSchema, { devices: [PHONE] }));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(NotificationSettings)));
  });
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

it("turns one switch off by sending the whole record, and shows it off", async () => {
  vi.mocked(pushClient.updatePreferences).mockResolvedValue(create(PushPreferencesSchema, { ...ALL_ON, groups: false }));
  const groupsSwitch = container.querySelector<HTMLInputElement>("#push-switch-groups")!;
  expect(groupsSwitch.checked).toBe(true);
  await act(async () => groupsSwitch.click());
  await settle();
  expect(pushClient.updatePreferences).toHaveBeenCalledWith({
    expenses: true,
    comments: true,
    payments: true,
    groups: false,
    friends: true,
  });
  expect(container.querySelector<HTMLInputElement>("#push-switch-groups")!.checked).toBe(false);
});

it("keeps a switch where it was and says why beside it when the save fails, then retries", async () => {
  vi.mocked(pushClient.updatePreferences).mockRejectedValueOnce(new Error("Could not save"));
  await act(async () => container.querySelector<HTMLInputElement>("#push-switch-expenses")!.click());
  await settle();
  const alert = container.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain("Could not save");
  expect(container.querySelector<HTMLInputElement>("#push-switch-expenses")!.checked).toBe(true);
  vi.mocked(pushClient.updatePreferences).mockResolvedValue(create(PushPreferencesSchema, { ...ALL_ON, expenses: false }));
  await act(async () => button("Retry").click());
  await settle();
  expect(vi.mocked(pushClient.updatePreferences).mock.calls.at(-1)?.[0]).toMatchObject({ expenses: false });
  expect(container.querySelector<HTMLInputElement>("#push-switch-expenses")!.checked).toBe(false);
});

it("refuses a change while offline instead of queuing it", async () => {
  onlineManager.setOnline(false);
  await act(async () => container.querySelector<HTMLInputElement>("#push-switch-friends")!.click());
  await settle();
  expect(pushClient.updatePreferences).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("offline");
});

it("lists the phone and confirms a test push on its row", async () => {
  expect(container.textContent).toContain("iPhone 17");
  vi.mocked(pushClient.sendTestPush).mockResolvedValue({} as never);
  await act(async () => button("Send a test").click());
  await settle();
  expect(pushClient.sendTestPush).toHaveBeenCalledWith({ deviceId: "dev-1" });
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Sent");
});

it("shows a refused test push on the phone's row", async () => {
  vi.mocked(pushClient.sendTestPush).mockRejectedValue(new Error("That phone isn't reachable any more."));
  await act(async () => button("Send a test").click());
  await settle();
  expect(container.querySelector("li [role='alert']")?.textContent).toContain("isn't reachable");
});

it("confirms a removed phone above the list after it disappears", async () => {
  vi.mocked(pushClient.removeDevice).mockResolvedValue({} as never);
  vi.mocked(pushClient.listDevices).mockResolvedValue(create(ListDevicesResponseSchema, { devices: [] }));
  await act(async () => button("Remove").click());
  await settle();
  expect(pushClient.removeDevice).toHaveBeenCalledWith({ deviceId: "dev-1" });
  expect(container.textContent).not.toContain("iPhone 17");
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Removed");
  expect(container.textContent).toContain("No phone gets notifications yet");
});

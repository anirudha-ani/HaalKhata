/** @vitest-environment jsdom */
/** The native Notifications card: switches save whole records, and every result shows beside its control. */

import { create } from "@bufbuild/protobuf";
import { DeviceSchema, ListDevicesResponseSchema, PushPreferencesSchema } from "@haalkhata/protogen/push/v1/push_pb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
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
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  Platform: { select: (options: { default: string }) => options.default },
  Linking: { openSettings: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Text: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) =>
    createElement("span", { role: accessibilityRole }, children),
  Pressable: ({ children, onPress }: { children: ReactNode; onPress: () => void }) =>
    createElement("button", { onClick: onPress }, children),
  Switch: ({ value, onValueChange, accessibilityLabel, disabled }: {
    value: boolean; onValueChange: (next: boolean) => void; accessibilityLabel: string; disabled?: boolean;
  }) =>
    createElement("input", {
      type: "checkbox",
      "aria-label": accessibilityLabel,
      checked: value,
      disabled,
      onChange: (event: { target: { checked: boolean } }) => onValueChange(event.target.checked),
    }),
}));
const thisPhone = vi.hoisted(() => ({
  state: { permission: "granted", deviceId: "dev-1", registering: false, error: "", keptOff: false, explainerOpen: false },
  markThisPhoneRemoved: vi.fn(),
}));
vi.mock("@/lib/push/pushStore", () => ({
  usePushState: () => thisPhone.state,
  pushState: () => thisPhone.state,
  refreshPushPermission: vi.fn(async () => "granted"),
  offerPushExplainer: vi.fn(),
  turnThisPhoneOn: vi.fn(),
  markThisPhoneRemoved: thisPhone.markThisPhoneRemoved,
}));
vi.mock("@/components/ui/Button", () => ({
  Button: ({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled: busy || disabled }, label),
}));

const ALL_ON = create(PushPreferencesSchema, { expenses: true, comments: true, payments: true, groups: true, friends: true });
const PHONE = create(DeviceSchema, { id: "dev-1", platform: "ios", label: "iPhone 17", lastSeenAt: "2026-10-15T09:00:00.000Z" });

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

/**
 * The switch for a category label.
 *
 * @param label - The category's label.
 * @returns Its checkbox stand-in.
 */
function switchFor(label: string): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
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
    root.render(
      createElement(QueryClientProvider, { client: queryClient }, createElement(NotificationSettings)),
    );
  });
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

it("turns one switch off by sending the whole record", async () => {
  vi.mocked(pushClient.updatePreferences).mockResolvedValue(create(PushPreferencesSchema, { ...ALL_ON, comments: false }));
  await act(async () => switchFor("Comments").click());
  await settle();
  expect(pushClient.updatePreferences).toHaveBeenCalledWith({
    expenses: true,
    comments: false,
    payments: true,
    groups: true,
    friends: true,
  });
  expect(switchFor("Comments").checked).toBe(false);
});

it("keeps a switch where it was and says why under it when the save fails", async () => {
  vi.mocked(pushClient.updatePreferences).mockRejectedValue(new Error("Could not save"));
  await act(async () => switchFor("Expenses").click());
  await settle();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not save");
  expect(switchFor("Expenses").checked).toBe(true);
});

it("says this phone is on, marks it in the list and confirms a test push on its row", async () => {
  expect(container.textContent).toContain("Notifications are on for this phone.");
  expect(container.textContent).toContain("·  This phone");
  vi.mocked(pushClient.sendTestPush).mockResolvedValue({} as never);
  await act(async () => button("Send a test").click());
  await settle();
  expect(pushClient.sendTestPush).toHaveBeenCalledWith({ deviceId: "dev-1" });
  expect(container.textContent).toContain("Sent. It should arrive in a few seconds.");
});

it("confirms a removed phone above the list after it disappears", async () => {
  vi.mocked(pushClient.removeDevice).mockResolvedValue({} as never);
  vi.mocked(pushClient.listDevices).mockResolvedValue(create(ListDevicesResponseSchema, { devices: [] }));
  await act(async () => button("Remove").click());
  await settle();
  expect(container.textContent).toContain("Removed.");
  expect(container.textContent).not.toContain("iPhone 17");
  // It was this phone, so its card turns to "off" at once.
  expect(thisPhone.markThisPhoneRemoved).toHaveBeenCalledOnce();
});

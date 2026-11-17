/** @vitest-environment jsdom */
/** A stuck native notification cleanup returns visible retry feedback without publishing a session. */

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PUSH_CLEANUP_ERROR, PUSH_CLEANUP_TIMEOUT_MS } from "@/lib/push/push.constants";
import { PasswordSheet } from "../components/PasswordSheet/PasswordSheet";

const native = vi.hoisted(() => ({
  calls: [] as string[], cache: vi.fn(), badge: vi.fn(), banners: vi.fn(), device: vi.fn(),
  setup: vi.fn(), token: vi.fn(), logIn: vi.fn(),
}));
vi.mock("@/lib/api/connect", () => ({ authClient: { logIn: native.logIn, signUp: vi.fn() }, pushClient: {},
  errorMessage: (failure: Error) => failure.message }));
vi.mock("@/lib/api/queryCache", () => ({ clearMobileQueryCache: native.cache }));
vi.mock("@/lib/api/session", () => ({ setSessionToken: native.token }));
vi.mock("@/lib/onboarding/deviceSetup", () => ({ markDeviceSetupDue: native.setup }));
vi.mock("@/lib/push/push", () => ({ clearDeviceId: native.device,
  installationId: vi.fn(), readExpoPushToken: vi.fn(), readPushPermission: vi.fn(), requestPushPermission: vi.fn(),
  saveDeviceId: vi.fn(), storedDeviceId: vi.fn() }));
vi.mock("expo-notifications", () => ({ setBadgeCountAsync: native.badge, dismissAllNotificationsAsync: native.banners }));
vi.mock("expo-device", () => ({ modelName: "iPhone" }));
vi.mock("expo-constants", () => ({ default: { expoConfig: {} } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("react-native", () => ({ Platform: { OS: "ios", select: (options: { ios?: string; default: string }) => options.ios ?? options.default }, StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));
vi.mock("@/components/ui/Text", () => ({ Text: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) =>
  createElement("span", { role: accessibilityRole }, children) }));
vi.mock("@/components/ui/Button", () => ({ Button: ({ busy, label, onPress }: { busy: boolean; label: string; onPress: () => void }) =>
  createElement("button", { disabled: busy, onClick: onPress }, label) }));
vi.mock("@/components/ui/Sheet/Sheet", () => ({ Sheet: ({ children, footer }: { children: ReactNode; footer: ReactNode }) =>
  createElement("section", null, children, footer) }));
vi.mock("@/components/ui/TextField", () => ({ TextField: () => null }));
vi.mock("@/components/ui/Segmented", () => ({ Segmented: () => null }));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

beforeEach(async () => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.calls.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  native.cache.mockImplementation(async () => { native.calls.push("cache"); client.clear(); });
  native.device.mockImplementation(async () => { native.calls.push("device"); });
  native.badge.mockImplementation(async () => { native.calls.push("badge"); return true; });
  native.banners.mockImplementation(async () => { native.calls.push("banners"); });
  native.setup.mockImplementation(async () => { native.calls.push("setup"); });
  native.token.mockImplementation(async () => { native.calls.push("token"); });
  native.logIn.mockResolvedValue({ token: "issued-session" });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(PasswordSheet, { onClose: () => undefined }))));
});
afterEach(() => { act(() => root.unmount()); container.remove(); client.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

/** @param milliseconds Advances native deadline and query notifications without wall-clock waiting. */
async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

/** Submits through the actual password sheet control. */
async function submit() {
  await act(async () => { container.querySelector("button")!.click(); });
  await advance(0);
}

it("ends the spinner with a visible retry error, then publishes only after a complete retry", async () => {
  let reply!: (value: boolean) => void;
  native.badge.mockReturnValueOnce(new Promise<boolean>((resolve) => { reply = resolve; }));
  await submit();
  expect(container.querySelector("button")!.disabled).toBe(true);
  expect(native.banners).toHaveBeenCalledOnce();
  expect(native.token).not.toHaveBeenCalled();
  await advance(PUSH_CLEANUP_TIMEOUT_MS - 1);
  expect(native.token).not.toHaveBeenCalled();
  await advance(2);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(PUSH_CLEANUP_ERROR);
  expect(container.querySelector("button")!.disabled).toBe(false);
  expect(native.setup).not.toHaveBeenCalled();
  expect(native.token).not.toHaveBeenCalled();
  await act(async () => { reply(true); });
  await advance(0);
  expect(native.token).not.toHaveBeenCalled();
  await submit();
  await advance(1);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(native.logIn).toHaveBeenCalledTimes(2);
  expect(native.token).toHaveBeenCalledExactlyOnceWith("issued-session");
  expect(native.calls.slice(-6)).toEqual(["cache", "device", "badge", "banners", "setup", "token"]);
});

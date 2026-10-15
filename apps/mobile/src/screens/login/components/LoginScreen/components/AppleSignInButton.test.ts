/** @vitest-environment jsdom */
/** Native Apple controls require backend configuration as well as device support. */

import { create } from "@bufbuild/protobuf";
import { SignInOptionsSchema } from "@haalkhata/protogen/auth/v1/auth_pb";
import { APPLE_SIGN_IN_UNAVAILABLE } from "@haalkhata/shared/auth/providerMessages";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authClient } from "@/lib/api/connect";
import { AppleSignInButton } from "./AppleSignInButton";

const device = vi.hoisted(() => ({ platform: "ios", supported: true }));
vi.mock("react-native", () => ({
  Platform: { get OS() { return device.platform; }, select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  ActivityIndicator: () => createElement("span", null, "Signing in"),
}));
vi.mock("expo-apple-authentication", () => ({
  isAvailableAsync: async () => device.supported,
  AppleAuthenticationButtonType: { CONTINUE: "continue" }, AppleAuthenticationButtonStyle: { BLACK: "black" },
  AppleAuthenticationButton: () => createElement("button", null, "Continue with Apple"),
}));
vi.mock("@/components/ui/Button", () => ({ Button: ({ label }: { label: string }) => createElement("button", null, label) }));
vi.mock("expo-crypto", () => ({}));
vi.mock("expo-web-browser", () => ({}));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/api/session", () => ({ setSessionToken: vi.fn() }));
vi.mock("@/lib/api/queryCache", () => ({ clearMobileQueryCache: vi.fn() }));
vi.mock("@/lib/invite/consumePendingInvite", () => ({ consumePendingInvite: vi.fn() }));
vi.mock("@/lib/api/connect", () => ({ authClient: { getSignInOptions: vi.fn(), beginAppleSignIn: vi.fn() }, errorMessage: (error: Error) => error.message }));

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  device.platform = "ios"; device.supported = true;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); queryClient.clear(); vi.unstubAllGlobals(); });

/** @returns Renders the real button/hooks with native host views replaced. */
async function render() {
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(AppleSignInButton))));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

it.each(["ios", "android"])("explains unavailable Apple credentials on %s", async (platform) => {
  device.platform = platform;
  vi.mocked(authClient.getSignInOptions).mockResolvedValue(create(SignInOptionsSchema));
  await render();
  expect(container.textContent).not.toContain("Continue with Apple");
  expect(container.textContent).toBe(APPLE_SIGN_IN_UNAVAILABLE);
  expect(authClient.beginAppleSignIn).not.toHaveBeenCalled();
});
it("shows configured native Apple even without browser callback settings", async () => {
  vi.mocked(authClient.getSignInOptions).mockResolvedValue(create(SignInOptionsSchema, { appleNativeEnabled: true }));
  await render();
  expect(container.textContent).toContain("Continue with Apple");
  expect(container.textContent).not.toContain(APPLE_SIGN_IN_UNAVAILABLE);
});
it("keeps configured Apple hidden on unsupported iOS devices", async () => {
  device.supported = false;
  vi.mocked(authClient.getSignInOptions).mockResolvedValue(create(SignInOptionsSchema, { appleNativeEnabled: true }));
  await render();
  expect(container.textContent).not.toContain("Continue with Apple");
  expect(container.textContent).toBe(APPLE_SIGN_IN_UNAVAILABLE);
});
it.each([false, true])("Android uses browser availability: %s", async (enabled) => {
  device.platform = "android";
  vi.mocked(authClient.getSignInOptions).mockResolvedValue(create(SignInOptionsSchema, { appleNativeEnabled: true, appleBrowserEnabled: enabled }));
  await render();
  expect(container.textContent?.includes("Continue with Apple")).toBe(enabled);
  expect(container.textContent?.includes(APPLE_SIGN_IN_UNAVAILABLE)).toBe(!enabled);
});
it("shows the availability message without backend error details when the request fails", async () => {
  vi.mocked(authClient.getSignInOptions).mockRejectedValue(new Error("offline"));
  await render();
  expect(container.textContent).toBe(APPLE_SIGN_IN_UNAVAILABLE);
  expect(authClient.beginAppleSignIn).not.toHaveBeenCalled();
});
it("waits for the availability check before showing an unavailable message", async () => {
  vi.mocked(authClient.getSignInOptions).mockReturnValue(new Promise(() => {}));
  await render();
  expect(container.textContent).toBe("");
});

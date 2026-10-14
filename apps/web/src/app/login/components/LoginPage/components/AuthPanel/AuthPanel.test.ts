/** @vitest-environment jsdom */
/** Real auth controls hide unavailable Apple configuration while retaining Google and local credentials. */

import { create } from "@bufbuild/protobuf";
import { SignInOptionsSchema } from "@haalkhata/protogen/auth/v1/auth_pb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authClient } from "@/lib/api/connect";
import { AuthPanel } from "./AuthPanel";

vi.mock("@/lib/api/connect", () => ({ authClient: { getSignInOptions: vi.fn(), beginAppleSignIn: vi.fn(), completeAppleSignIn: vi.fn() }, errorMessage: (error: Error) => error.message }));
vi.mock("@/lib/auth/completeSignIn", () => ({ completeBrowserSignIn: vi.fn() }));
vi.mock("../../hooks/useLogin", () => ({ useLogin: () => ({ mode: "login", identifier: "", password: "", error: "", isPending: false, setIdentifier: vi.fn(), setPassword: vi.fn(), switchMode: vi.fn(), submit: vi.fn() }) }));
vi.mock("../../hooks/useGoogleSignIn", () => ({ useGoogleSignIn: () => ({ isConfigured: true, isPending: false, error: "", setButtonElement: (element: HTMLDivElement | null) => { if (element) element.textContent = "Continue with Google"; } }) }));

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); queryClient.clear(); vi.unstubAllGlobals(); });

/** @returns Renders the actual panel and lets the provider lookup finish. */
async function render() {
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient },
    createElement(AuthPanel, { mobileOpen: false, onMobileClose: vi.fn() }))));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

it("hides Apple with incomplete configuration while Google stays visible", async () => {
  vi.mocked(authClient.getSignInOptions).mockResolvedValue(create(SignInOptionsSchema));
  await render();
  expect(container.textContent).not.toContain("Continue with Apple");
  expect(container.textContent).toContain("Continue with Google");
  expect(authClient.beginAppleSignIn).not.toHaveBeenCalled();
});
it("shows Apple only when the backend enables the browser flow", async () => {
  vi.mocked(authClient.getSignInOptions).mockResolvedValue(create(SignInOptionsSchema, { appleBrowserEnabled: true, appleNativeEnabled: true }));
  await render();
  expect(container.textContent).toContain("Continue with Apple");
});
it("does not show a broken Apple button or configuration error when lookup fails", async () => {
  vi.mocked(authClient.getSignInOptions).mockRejectedValue(new Error("backend offline"));
  await render();
  expect(container.textContent).not.toContain("Continue with Apple");
  expect(container.textContent).not.toContain("backend offline");
  expect(container.textContent).toContain("Continue with Google");
});
it("keeps Apple hidden while configuration is still loading", async () => {
  vi.mocked(authClient.getSignInOptions).mockReturnValue(new Promise(() => {}));
  await render();
  expect(container.textContent).not.toContain("Continue with Apple");
});

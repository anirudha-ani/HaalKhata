/** @vitest-environment jsdom */
/** Provider startup recovery exercises the real control, hook and script loader. */

import { create } from "@bufbuild/protobuf";
import { GoogleSignInChallengeSchema } from "@haalkhata/protogen/auth/v1/auth_pb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authClient } from "@/lib/api/connect";
import { GOOGLE_SCRIPT_ELEMENT_ID } from "@/lib/googleIdentity/googleIdentity.constants";
import { GoogleSignIn } from "./GoogleSignIn";

vi.mock("@/lib/api/connect", () => ({ authClient: { beginGoogleSignIn: vi.fn(), logInWithGoogle: vi.fn() }, errorMessage: (error: Error) => error.message }));
vi.mock("@/lib/auth/completeSignIn", () => ({ completeBrowserSignIn: vi.fn() }));
vi.mock("@/app/login/constants/googleSignIn", async (importOriginal) => ({ ...await importOriginal<object>(), GOOGLE_CLIENT_ID: "test-google-client" }));

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
let resize: ResizeObserverCallback;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(330);
  vi.mocked(authClient.beginGoogleSignIn).mockResolvedValue(create(GoogleSignInChallengeSchema, { nonce: "server-issued-nonce" }));
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); container.remove(); queryClient.clear();
  document.getElementById(GOOGLE_SCRIPT_ELEMENT_ID)?.remove();
  delete window.google;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

/** @returns Mounts the actual Google control and completes the effect's initial turn. */
async function render() {
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(GoogleSignIn))));
}

it("retries a failed script load with a fresh nonce and renders Google's button at the card width", async () => {
  await render();
  expect(container.textContent).toContain("Loading Google sign-in");
  const failedScript = document.getElementById(GOOGLE_SCRIPT_ELEMENT_ID)!;
  await act(async () => failedScript.dispatchEvent(new Event("error")));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("couldn’t load");
  expect(failedScript.isConnected).toBe(false);

  await act(async () => container.querySelector("button")!.click());
  const retriedScript = document.getElementById(GOOGLE_SCRIPT_ELEMENT_ID)!;
  expect(retriedScript).not.toBe(failedScript);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(authClient.beginGoogleSignIn).toHaveBeenCalledTimes(2);

  const initialize = vi.fn();
  const renderButton = vi.fn((parent: HTMLElement) => { parent.textContent = "Continue with Google"; });
  window.google = { accounts: { id: { initialize, renderButton } } };
  await act(async () => retriedScript.dispatchEvent(new Event("load")));
  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ nonce: "server-issued-nonce" }));
  expect(renderButton).toHaveBeenLastCalledWith(expect.any(HTMLElement), expect.objectContaining({ width: 330 }));
  expect(container.textContent).toBe("Continue with Google");

  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(260);
  act(() => resize([], {} as ResizeObserver));
  expect(renderButton).toHaveBeenLastCalledWith(expect.any(HTMLElement), expect.objectContaining({ width: 260 }));
  expect(authClient.logInWithGoogle).not.toHaveBeenCalled();
});

it("recovers from a failed backend challenge without a page reload", async () => {
  window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } };
  vi.mocked(authClient.beginGoogleSignIn).mockRejectedValueOnce(new Error("backend unavailable"));
  await render();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(window.google.accounts.id.initialize).toHaveBeenCalledOnce();
  expect(authClient.beginGoogleSignIn).toHaveBeenCalledTimes(2);
});

it("keeps Google's button armed with a fresh nonce while the page stays open", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const initialize = vi.fn();
  window.google = { accounts: { id: { initialize, renderButton: vi.fn() } } };
  vi.mocked(authClient.beginGoogleSignIn)
    .mockResolvedValueOnce(create(GoogleSignInChallengeSchema, { nonce: "first-nonce", lifetimeSeconds: 600 }))
    .mockResolvedValueOnce(create(GoogleSignInChallengeSchema, { nonce: "second-nonce", lifetimeSeconds: 600 }));
  try {
    await render();
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ nonce: "first-nonce" }));

    // Half of its ten minutes later, before anyone could be refused for it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });

    expect(authClient.beginGoogleSignIn).toHaveBeenCalledTimes(2);
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ nonce: "second-nonce" }));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it("arms the button with a fresh nonce straight after a failed sign-in, keeping the reason on screen", async () => {
  const initialize = vi.fn();
  window.google = { accounts: { id: { initialize, renderButton: vi.fn() } } };
  vi.mocked(authClient.beginGoogleSignIn)
    .mockResolvedValueOnce(create(GoogleSignInChallengeSchema, { nonce: "spent-nonce", lifetimeSeconds: 600 }))
    .mockResolvedValueOnce(create(GoogleSignInChallengeSchema, { nonce: "fresh-nonce", lifetimeSeconds: 600 }));
  vi.mocked(authClient.logInWithGoogle).mockRejectedValue(new Error("that Google sign-in has expired"));
  await render();
  const { callback } = initialize.mock.calls[0][0] as { callback: (response: { credential: string }) => void };

  await act(async () => callback({ credential: "google-id-token" }));

  expect(container.textContent).toContain("that Google sign-in has expired");
  expect(authClient.beginGoogleSignIn).toHaveBeenCalledTimes(2);
  expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ nonce: "fresh-nonce" }));
});

/** @vitest-environment jsdom */
/** The admin sign-in card, driven through its real hook and Google's real script loader. */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { adminAnalyticsClient } from "@/lib/api/adminConnect";
import {
  GOOGLE_SCRIPT_ELEMENT_ID,
  GOOGLE_SDK_MISSING_MESSAGE,
} from "@/lib/googleIdentity/googleIdentity.constants";
import { AdminSignIn } from "./AdminSignIn";

vi.mock("@/lib/api/adminConnect", () => ({
  adminAnalyticsClient: { beginSignIn: vi.fn(), signIn: vi.fn() },
}));
vi.mock("@/lib/api/connect", () => ({ errorMessage: (error: Error) => error.message }));

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(adminAnalyticsClient.beginSignIn).mockResolvedValue({ nonce: "server-issued-nonce" } as never);
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  document.getElementById(GOOGLE_SCRIPT_ELEMENT_ID)?.remove();
  delete window.google;
  vi.unstubAllGlobals();
});

/** Mounts the card for a configured server and lets its setup effect start. */
async function render() {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(AdminSignIn, {
          googleClientId: "admin-client",
          allowlistConfigured: true,
          onSignedIn: vi.fn(),
          sessionEnded: false,
        }),
      ),
    ),
  );
}

it("says why there is no button when Google's script runs but never starts", async () => {
  await render();

  await act(async () => document.getElementById(GOOGLE_SCRIPT_ELEMENT_ID)!.dispatchEvent(new Event("load")));

  expect(container.querySelector('[role="alert"]')?.textContent).toContain(GOOGLE_SDK_MISSING_MESSAGE);
});

it("takes a spent button down after a refusal, and offers to try again when no fresh nonce comes", async () => {
  let signInCallback: (response: { credential: string }) => void = () => undefined;
  const renderButton = vi.fn((parent: HTMLElement) => {
    parent.textContent = "Continue with Google";
  });
  window.google = {
    accounts: {
      id: {
        initialize: vi.fn((config) => {
          signInCallback = config.callback;
        }),
        renderButton,
      },
    },
  };
  vi.mocked(adminAnalyticsClient.signIn).mockRejectedValue(
    new Error("this Google account does not have admin access"),
  );
  await render();
  expect(container.textContent).toContain("Continue with Google");

  // The wrong account: the nonce it carried is spent, and the next one is refused.
  vi.mocked(adminAnalyticsClient.beginSignIn).mockRejectedValueOnce(
    new Error("too many attempts, please try again later"),
  );
  await act(async () => signInCallback({ credential: "wrong-account-token" }));

  expect(adminAnalyticsClient.beginSignIn).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain("Continue with Google");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Could not start Google sign-in: too many attempts, please try again later",
  );

  await act(async () =>
    [...container.querySelectorAll("button")].find((button) => button.textContent === "Try again")!.click(),
  );

  expect(adminAnalyticsClient.beginSignIn).toHaveBeenCalledTimes(3);
  expect(container.textContent).toContain("Continue with Google");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("renews an unspent nonce at half its life, keeping the good button on screen meanwhile", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const initialize = vi.fn();
  const renderButton = vi.fn((parent: HTMLElement) => {
    parent.textContent = "Continue with Google";
  });
  window.google = { accounts: { id: { initialize, renderButton } } };
  let finishRenewal: (challenge: never) => void = () => undefined;
  vi.mocked(adminAnalyticsClient.beginSignIn)
    .mockResolvedValueOnce({ nonce: "first-nonce", lifetimeSeconds: 600 } as never)
    .mockReturnValueOnce(new Promise((resolve) => (finishRenewal = resolve)) as never);
  try {
    await render();
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ nonce: "first-nonce" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });
    // The fresh nonce is on its way; the button on screen is still good.
    expect(adminAnalyticsClient.beginSignIn).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Continue with Google");

    await act(async () => finishRenewal({ nonce: "second-nonce", lifetimeSeconds: 600 } as never));
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ nonce: "second-nonce" }));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

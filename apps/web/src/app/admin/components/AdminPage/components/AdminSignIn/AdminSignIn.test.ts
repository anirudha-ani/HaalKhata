/** @vitest-environment jsdom */
/** The admin sign-in card, driven through its real hook and Google's real script loader. */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { adminAnalyticsClient } from "@/lib/api/connect";
import {
  GOOGLE_SCRIPT_ELEMENT_ID,
  GOOGLE_SDK_MISSING_MESSAGE,
} from "@/lib/googleIdentity/googleIdentity.constants";
import { AdminSignIn } from "./AdminSignIn";

vi.mock("@/lib/api/connect", () => ({
  adminAnalyticsClient: { beginSignIn: vi.fn(), signIn: vi.fn() },
  errorMessage: (error: Error) => error.message,
}));

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

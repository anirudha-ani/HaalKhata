/** @vitest-environment jsdom */
/** Signing out takes the account off the screen at once and says so if the server cannot finish it. */

import { Code, ConnectError } from "@connectrpc/connect";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "@/lib/api/connect";
import { SIGN_OUT_RETRY_INTERVAL_MS, SIGN_OUT_STUCK_MESSAGE } from "./constants/signOutGate";

vi.mock("@/lib/api/connect", () => ({ authClient: { logOut: vi.fn() } }));

const logOut = vi.mocked(authClient.logOut);
const replace = vi.fn();
let signOut: typeof import("@/lib/auth/signOut");
let queryClient: QueryClient;
let container: HTMLDivElement;
let root: Root;

/** Mounts the gate around a page, with a fresh tab's worth of state. */
async function openPage() {
  vi.resetModules();
  signOut = await import("@/lib/auth/signOut");
  const { SignOutGate } = await import("./SignOutGate");
  queryClient = new QueryClient();
  queryClient.setQueryData(["me"], { name: "Sara" });
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client: queryClient }, createElement(SignOutGate, null, createElement("p", null, "Your ledger"))),
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  window.localStorage.clear();
  logOut.mockReset();
  replace.mockReset();
  vi.stubGlobal("location", { ...window.location, replace });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SignOutGate", () => {
  it("leaves the app alone until somebody signs out", async () => {
    await openPage();

    expect(container.textContent).toContain("Your ledger");
    expect(logOut).not.toHaveBeenCalled();
  });

  it("drops the account's data, ends the session, then leaves for the login page", async () => {
    logOut.mockResolvedValue({} as never);
    await openPage();

    await act(async () => signOut.beginSignOut());

    expect(container.textContent).not.toContain("Your ledger");
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(replace).toHaveBeenCalledExactlyOnceWith("/login");
    expect(signOut.isSignOutPending()).toBe(true);
    expect(window.localStorage.length).toBe(0);
  });

  it("counts a session that had already ended as signed out", async () => {
    logOut.mockRejectedValue(new ConnectError("expired", Code.Unauthenticated));
    await openPage();

    await act(async () => signOut.beginSignOut());

    expect(replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it("says so when the server cannot be reached, shows no data, and does not pretend", async () => {
    logOut.mockRejectedValue(new ConnectError("offline", Code.Unavailable));
    await openPage();

    await act(async () => signOut.beginSignOut());

    expect(container.textContent).toContain(SIGN_OUT_STUCK_MESSAGE);
    expect(container.textContent).not.toContain("Your ledger");
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(replace).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(1);
  });

  it("finishes by itself once the server answers", async () => {
    logOut.mockRejectedValueOnce(new ConnectError("offline", Code.Unavailable));
    logOut.mockResolvedValue({} as never);
    await openPage();
    await act(async () => signOut.beginSignOut());
    expect(replace).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(SIGN_OUT_RETRY_INTERVAL_MS));

    expect(replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it("finishes as soon as the browser is back online", async () => {
    logOut.mockRejectedValueOnce(new ConnectError("offline", Code.Unavailable));
    logOut.mockResolvedValue({} as never);
    await openPage();
    await act(async () => signOut.beginSignOut());

    await act(async () => void window.dispatchEvent(new Event("online")));

    expect(replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it("finishes a sign-out left behind by a closed tab, without showing the app", async () => {
    logOut.mockResolvedValue({} as never);
    window.localStorage.setItem("haalkhata.signOutPending", "1");

    await openPage();

    expect(container.textContent).not.toContain("Your ledger");
    expect(replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it("follows a sign-out from another tab", async () => {
    logOut.mockRejectedValue(new ConnectError("already over", Code.Unauthenticated));
    await openPage();

    await act(async () => {
      window.localStorage.setItem("haalkhata.signOutPending", "1");
      window.dispatchEvent(new StorageEvent("storage", { key: "haalkhata.signOutPending", newValue: "1" }));
    });

    expect(container.textContent).not.toContain("Your ledger");
    expect(replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it("ends the app when the server refuses the session mid-use", async () => {
    logOut.mockRejectedValue(new ConnectError("expired", Code.Unauthenticated));
    await openPage();

    await act(async () => signOut.noticeSessionEnded());

    expect(container.textContent).not.toContain("Your ledger");
    expect(replace).toHaveBeenCalledExactlyOnceWith("/login");
  });
});

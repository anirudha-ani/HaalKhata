/** @vitest-environment jsdom */
/** Sign-out forgets this phone for pushes while the session can still ask, ends the session, and finishes later when offline. */

import { create } from "@bufbuild/protobuf";
import { UserSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const order = vi.hoisted(() => ({
  calls: [] as string[],
  logOut: vi.fn(),
  forget: vi.fn(),
  replace: vi.fn(),
  remember: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("expo-router", () => ({ useRouter: () => ({ replace: order.replace, push: vi.fn() }) }));
vi.mock("@/lib/api/connect", () => ({
  authClient: { logOut: order.logOut },
  socialClient: {},
  errorMessage: (error: Error) => error.message,
}));
vi.mock("react-native", () => ({ Alert: { alert: order.alert } }));
vi.mock("@/lib/api/session", () => ({
  clearSession: vi.fn(async () => void order.calls.push("clearSession")),
  sessionToken: () => "token-a",
}));
vi.mock("@/lib/api/unfinishedSignOut", () => ({
  rememberUnfinishedSignOut: order.remember,
  sessionAlreadyEnded: (failure: Error) => failure.message === "session expired",
}));
vi.mock("@/lib/api/queryCache", () => ({ clearMobileQueryCache: vi.fn(async () => void order.calls.push("clearCache")) }));
vi.mock("@/lib/push/pushStore", () => ({ forgetThisPhone: order.forget }));

import { useProfileForm } from "./useAccount";

let root: Root;
let container: HTMLDivElement;
let signOut: () => Promise<void>;

/** Renders the hook and exposes its sign-out action. */
function Probe() {
  signOut = useProfileForm(create(UserSchema, { id: "user-a", name: "Ani", defaultCurrency: "USD" })).signOut;
  return null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  order.calls.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  order.forget.mockImplementation(async () => void order.calls.push("forgetThisPhone"));
  order.logOut.mockImplementation(async () => void order.calls.push("logOut"));
  order.remember.mockResolvedValue(undefined);
  container = document.createElement("div");
  root = createRoot(container);
  const queryClient = new QueryClient();
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
  });
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

it("forgets this phone before LogOut ends the session that could ask", async () => {
  await act(async () => signOut());
  expect(order.calls).toEqual(["forgetThisPhone", "logOut", "clearSession", "clearCache"]);
  expect(order.replace).toHaveBeenCalledWith("/login");
});

it("signs out locally offline, keeps the token to end the session later, and says so", async () => {
  order.logOut.mockRejectedValue(new Error("offline"));
  await act(async () => signOut());
  expect(order.calls).toEqual(["forgetThisPhone", "clearSession", "clearCache"]);
  expect(order.replace).toHaveBeenCalledWith("/login");
  expect(order.remember).toHaveBeenCalledExactlyOnceWith("token-a");
  expect(order.alert).toHaveBeenCalledExactlyOnceWith("Signed out on this phone", expect.stringContaining("notifications"));
});

it("keeps nothing when the session had already ended on the server", async () => {
  order.logOut.mockRejectedValue(new Error("session expired"));
  await act(async () => signOut());
  expect(order.remember).not.toHaveBeenCalled();
  expect(order.alert).not.toHaveBeenCalled();
});

it("keeps nothing and says nothing when LogOut succeeds", async () => {
  await act(async () => signOut());
  expect(order.remember).not.toHaveBeenCalled();
  expect(order.alert).not.toHaveBeenCalled();
});

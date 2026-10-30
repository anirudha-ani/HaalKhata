/** @vitest-environment jsdom */
/** Public invites retain visible acceptance, storage errors and profile-request confirmation, and never ask a signed-in person to sign in. */

import { create } from "@bufbuild/protobuf";
import { UserSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { AcceptInviteLinkResponseSchema, InvitePreviewSchema } from "@haalkhata/protogen/social/v1/social_pb";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Code, ConnectError } from "@connectrpc/connect";
import { LIVE_SPLIT_ENDED_MESSAGE } from "@haalkhata/shared/expense/live/live.constants";
import { authClient, socialClient } from "@/lib/api/connect";
import { stashPendingInvite } from "@/lib/invite/pendingInvite";
import { JoinScreen } from "./JoinScreen";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
// The phone's saved session as the app holds it: unread at first on a cold
// start, then the stored token or none.
const savedSession = vi.hoisted(() => {
  let state: { token: string | null; hydrated: boolean } = { token: "sam-session", hydrated: true };
  const listeners = new Set<() => void>();
  return {
    read: () => state,
    set: (next: { token: string | null; hydrated: boolean }) => {
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock("@/lib/api/session", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useSession: () => useSyncExternalStore(savedSession.subscribe, savedSession.read) };
});
vi.mock("expo-router", () => ({ useRouter: () => navigation }));
vi.mock("react-native", () => ({
  AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove: () => undefined }) },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  Platform: { select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  ScrollView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Text: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) => createElement("span", { role: accessibilityRole }, children),
  Pressable: ({ children, onPress, disabled }: { children: ReactNode; onPress: () => void; disabled: boolean }) => createElement("button", { onClick: onPress, disabled }, children),
  ActivityIndicator: () => createElement("span", null, "Loading"),
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: { children: ReactNode }) => createElement("main", null, children) }));
vi.mock("@/lib/api/connect", () => ({
  authClient: { getMe: vi.fn() },
  socialClient: { previewInviteLink: vi.fn(), acceptInviteLink: vi.fn() },
  errorMessage: (error: Error) => error.message,
}));
vi.mock("@/lib/invite/pendingInvite", () => ({ stashPendingInvite: vi.fn() }));
/**
 * An invite preview as the plain client hands it over.
 *
 * @param init - Its fields.
 * @returns The preview.
 */
function previewOf(init: Parameters<typeof create<typeof InvitePreviewSchema>>[1]) {
  return { ...create(InvitePreviewSchema, init), totalCents: 0 };
}

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

/** @returns Waits for React Query to notify the rendered screen. */
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
/** @returns The actual screen and hooks under their query provider. */
async function render() {
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(JoinScreen, { token: "invite-token" }))));
  await settle();
}
/** @param label Visible action to click. @returns Waits for the action result to render. */
async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) => element.textContent === label);
  expect(button, label).toBeDefined();
  await act(async () => { button!.click(); });
  await settle();
}

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  savedSession.set({ token: "sam-session", hydrated: true });
  // As the server answers: a call carrying no session is refused.
  vi.mocked(authClient.getMe).mockImplementation(async () => {
    if (!savedSession.read().token) throw new ConnectError("sign in first", Code.Unauthenticated);
    return create(UserSchema, { id: "viewer", name: "Sam" });
  });
  vi.mocked(socialClient.previewInviteLink).mockResolvedValue(previewOf({ kind: "group", inviterName: "Ari", groupName: "Trip", memberCount: 2 }));
  vi.mocked(socialClient.acceptInviteLink).mockResolvedValue(create(AcceptInviteLinkResponseSchema, { groupId: "trip" }));
  vi.mocked(stashPendingInvite).mockResolvedValue();
});
afterEach(() => { act(() => root.unmount()); container.remove(); queryClient.clear(); vi.unstubAllGlobals(); });

describe("native invite landing", () => {
  it("accepts only after a tap, invalidates cached membership and navigates to the group", async () => {
    queryClient.setQueryData(queryKeys.groups, { groups: [] });
    await render();
    expect(container.textContent).toContain("Signed in as Sam");
    expect(socialClient.acceptInviteLink).not.toHaveBeenCalled();
    await click("Join the group");
    expect(socialClient.acceptInviteLink).toHaveBeenCalledExactlyOnceWith({ token: "invite-token" });
    expect(queryClient.getQueryState(queryKeys.groups)?.isInvalidated).toBe(true);
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/groups/trip");
  });
  it("keeps a profile request confirmation visible instead of opening an empty Friends list", async () => {
    vi.mocked(socialClient.previewInviteLink).mockResolvedValue(previewOf({ kind: "profile", inviterName: "Ari" }));
    await render(); await click("Send friend request");
    expect(container.textContent).toContain("Request sent — Ari will confirm from their side");
    expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("shows acceptance errors beside the action so the same invite can be retried", async () => {
    vi.mocked(socialClient.acceptInviteLink).mockRejectedValue(new Error("Invitation was revoked"));
    await render(); await click("Join the group");
    expect(container.textContent).toContain("Invitation was revoked");
    expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("says a link past its date has expired and what to do, offering no way in", async () => {
    vi.mocked(socialClient.previewInviteLink).mockRejectedValue(
      new ConnectError("this invite link has expired", Code.FailedPrecondition),
    );
    await render();
    expect(container.textContent).toContain("This invite link has expired");
    expect(container.textContent).toContain("Group invite links work for 7 days. Ask someone in the group to share a new one.");
    expect(container.textContent).not.toContain("Join the group");
  });
  it("keeps the general wording for a link that never worked or was turned off", async () => {
    vi.mocked(socialClient.previewInviteLink).mockRejectedValue(
      new ConnectError("that invite link isn't valid or was turned off", Code.NotFound),
    );
    await render();
    expect(container.textContent).toContain("This invite link isn’t active");
    expect(container.textContent).toContain("that invite link isn't valid or was turned off");
  });
  it("shows storage failures and retries before leaving for login", async () => {
    savedSession.set({ token: null, hydrated: true });
    vi.mocked(stashPendingInvite).mockRejectedValue(new Error("Could not save invite"));
    await render();
    // Nobody is signed in on this phone: nothing to ask the server.
    expect(authClient.getMe).not.toHaveBeenCalled();
    await click("Sign in to accept");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not save invite");
    expect(navigation.replace).not.toHaveBeenCalled();
    vi.mocked(stashPendingInvite).mockResolvedValue();
    await click("Sign in to accept");
    expect(stashPendingInvite).toHaveBeenLastCalledWith("invite-token");
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/login");
  });
  it("waits for the saved sign-in when a link starts the app, and greets the person signed in", async () => {
    // The app was not running: the link opens this screen before the saved
    // session has been read off the phone.
    savedSession.set({ token: null, hydrated: false });
    await render();
    expect(authClient.getMe).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Sign in to accept");

    await act(async () => savedSession.set({ token: "sam-session", hydrated: true }));
    await settle();

    expect(container.textContent).toContain("Signed in as Sam");
    expect(container.textContent).toContain("Join the group");
    expect(container.textContent).not.toContain("Sign in to accept");
  });
  it("says when it cannot tell who is signed in, and asks again on a tap, never offering a second sign-in", async () => {
    vi.mocked(authClient.getMe).mockRejectedValueOnce(new Error("HaalKhata could not be reached"));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("HaalKhata could not be reached");
    expect(container.textContent).not.toContain("Sign in to accept");

    await click("Try again");

    expect(container.textContent).toContain("Signed in as Sam");
  });
  it("lands on the live split after joining it", async () => {
    vi.mocked(socialClient.previewInviteLink).mockResolvedValue({
      ...previewOf({ kind: "live", inviterName: "Ari", memberCount: 2, expenseDescription: "Dinner", currency: "USD" }),
      totalCents: 4400,
    });
    vi.mocked(socialClient.acceptInviteLink).mockResolvedValue(create(AcceptInviteLinkResponseSchema, { expenseId: "dinner" }));
    await render();
    expect(container.textContent).toContain("Ari is splitting “Dinner” live");
    await click("Join the split");
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/expenses/dinner/live");
  });
  it("says a live split has ended, and what to do", async () => {
    vi.mocked(socialClient.previewInviteLink).mockRejectedValue(
      new ConnectError(LIVE_SPLIT_ENDED_MESSAGE, Code.FailedPrecondition),
    );
    await render();
    expect(container.textContent).toContain("This live split has ended");
    expect(container.textContent).toContain("Ask whoever started it to start another.");
  });
});

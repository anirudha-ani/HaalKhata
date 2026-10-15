/** @vitest-environment jsdom */
/** Public invites retain visible acceptance, storage errors and profile-request confirmation. */

import { create } from "@bufbuild/protobuf";
import { UserSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { AcceptInviteLinkResponseSchema, InvitePreviewSchema } from "@haalkhata/protogen/social/v1/social_pb";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient, socialClient } from "@/lib/api/connect";
import { stashPendingInvite } from "@/lib/invite/pendingInvite";
import { JoinScreen } from "./JoinScreen";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => navigation }));
vi.mock("react-native", () => ({
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
  vi.mocked(authClient.getMe).mockResolvedValue(create(UserSchema, { id: "viewer", name: "Sam" }));
  vi.mocked(socialClient.previewInviteLink).mockResolvedValue(create(InvitePreviewSchema, { kind: "group", inviterName: "Ari", groupName: "Trip", memberCount: 2 }));
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
    vi.mocked(socialClient.previewInviteLink).mockResolvedValue(create(InvitePreviewSchema, { kind: "profile", inviterName: "Ari" }));
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
  it("shows storage failures and retries before leaving for login", async () => {
    vi.mocked(authClient.getMe).mockRejectedValue(new Error("Not signed in"));
    vi.mocked(stashPendingInvite).mockRejectedValue(new Error("Could not save invite"));
    await render(); await click("Sign in to accept");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not save invite");
    expect(navigation.replace).not.toHaveBeenCalled();
    vi.mocked(stashPendingInvite).mockResolvedValue();
    await click("Sign in to accept");
    expect(stashPendingInvite).toHaveBeenLastCalledWith("invite-token");
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/login");
  });
});

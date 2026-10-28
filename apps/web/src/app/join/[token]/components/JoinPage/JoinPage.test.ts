/** @vitest-environment jsdom */
/** The invite landing page tells an expired link apart from one that never worked, and offers no way in with either. */

import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { UserSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { InvitePreviewSchema } from "@haalkhata/protogen/social/v1/social_pb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient, socialClient } from "@/lib/api/connect";
import { JoinPage } from "./JoinPage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children),
}));
vi.mock("@/lib/api/connect", () => ({
  authClient: { getMe: vi.fn() },
  socialClient: { previewInviteLink: vi.fn(), acceptInviteLink: vi.fn() },
  errorMessage: (error: unknown) => (error instanceof ConnectError ? error.rawMessage : String(error)),
}));

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

/** Renders the page for one token and lets its queries settle. */
async function render(): Promise<void> {
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(JoinPage, { token: "invite-token" }))),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(authClient.getMe).mockResolvedValue(create(UserSchema, { id: "viewer", name: "Sam" }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("the invite landing page", () => {
  it("offers a link that works", async () => {
    vi.mocked(socialClient.previewInviteLink).mockResolvedValue(
      create(InvitePreviewSchema, { kind: "group", inviterName: "Ari", groupName: "Trip", memberCount: 2 }),
    );

    await render();

    expect(container.textContent).toContain("Ari invited you to “Trip”");
    expect(container.textContent).toContain("Join the group");
  });

  it("says a link past its date has expired and what to do, offering no way in", async () => {
    vi.mocked(socialClient.previewInviteLink).mockRejectedValue(
      new ConnectError("this invite link has expired", Code.FailedPrecondition),
    );

    await render();

    expect(container.querySelector("h1")?.textContent).toBe("This invite link has expired");
    expect(container.textContent).toContain("Group invite links work for 7 days. Ask someone in the group to share a new one.");
    expect(container.textContent).not.toContain("Join the group");
  });

  it("keeps the general wording for a link that never worked or was turned off", async () => {
    vi.mocked(socialClient.previewInviteLink).mockRejectedValue(
      new ConnectError("that invite link isn't valid or was turned off", Code.NotFound),
    );

    await render();

    expect(container.querySelector("h1")?.textContent).toBe("This invite link isn’t active");
    expect(container.textContent).toContain("that invite link isn't valid or was turned off");
  });
});

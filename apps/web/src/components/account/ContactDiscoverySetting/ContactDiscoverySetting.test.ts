/** @vitest-environment jsdom */
/** The Account discoverability switch saves each flip at once and reports the outcome beside it. */

import { create } from "@bufbuild/protobuf";
import { ContactDiscovery, UserSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { CONTACT_DISCOVERY_SETTING } from "@haalkhata/shared/contacts/contactsCopy";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authClient } from "@/lib/api/connect";
import { ContactDiscoverySetting } from "./ContactDiscoverySetting";

vi.mock("@/lib/api/connect", () => ({
  authClient: { setContactDiscovery: vi.fn() },
  errorMessage: (error: Error) => error.message,
}));

const FINDABLE = create(UserSchema, { id: "me", name: "Anirudha", contactDiscovery: ContactDiscovery.ON });
let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

/** @returns The switch input. */
function toggle(): HTMLInputElement {
  return container.querySelector("input[role=switch]")!;
}

/** Flips the switch and lets the save settle. */
async function flip() {
  await act(async () => { toggle().click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(queryKeys.me, FINDABLE);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: queryClient },
      createElement(ContactDiscoverySetting, { answer: ContactDiscovery.ON })));
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

it("turns discovery off on the server and confirms it", async () => {
  vi.mocked(authClient.setContactDiscovery).mockResolvedValue(
    create(UserSchema, { ...FINDABLE, contactDiscovery: ContactDiscovery.OFF }),
  );
  expect(toggle().checked).toBe(true);
  await flip();
  expect(authClient.setContactDiscovery).toHaveBeenCalledExactlyOnceWith({ discoverable: false });
  expect(queryClient.getQueryData(queryKeys.me)).toMatchObject({ contactDiscovery: ContactDiscovery.OFF });
  expect(container.querySelector("[role=status]")?.textContent).toBe(CONTACT_DISCOVERY_SETTING.hiddenNotice);
});

it("shows a failed save beside the switch and leaves the stored answer alone", async () => {
  vi.mocked(authClient.setContactDiscovery).mockRejectedValue(new Error("Couldn't save — try again"));
  await flip();
  expect(container.querySelector("[role=alert]")?.textContent).toBe("Couldn't save — try again");
  expect(queryClient.getQueryData(queryKeys.me)).toEqual(FINDABLE);
});

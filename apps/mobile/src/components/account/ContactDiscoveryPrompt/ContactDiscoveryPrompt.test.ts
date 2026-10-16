/** @vitest-environment jsdom */
/** The one-time discoverability card saves the answer, says what it saved, and shows failures beside its buttons. */

import { create } from "@bufbuild/protobuf";
import { ContactDiscovery, UserSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { CONTACT_DISCOVERY_PROMPT } from "@haalkhata/shared/contacts/contactsCopy";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authClient } from "@/lib/api/connect";
import { ContactDiscoveryPrompt } from "./ContactDiscoveryPrompt";

vi.mock("@/lib/api/connect", () => ({
  authClient: { setContactDiscovery: vi.fn() },
  errorMessage: (error: Error) => error.message,
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  Platform: { select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Text: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) =>
    createElement("span", { role: accessibilityRole }, children),
}));
vi.mock("@/components/ui/Button", () => ({
  Button: ({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled: busy || disabled }, label),
}));

const UNANSWERED = create(UserSchema, { id: "me", name: "Anirudha" });
let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

/**
 * Mounts the card for one stored answer.
 *
 * @param answer - The caller's stored answer.
 */
async function mount(answer: ContactDiscovery) {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: queryClient },
      createElement(ContactDiscoveryPrompt, { answer })));
  });
}

/**
 * Presses the button with the given label and lets the mutation settle.
 *
 * @param label - Visible button text.
 */
async function press(label: string) {
  const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
  await act(async () => { button!.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(queryKeys.me, UNANSWERED);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

it("saves a yes, updates the cached profile and keeps a confirmation on screen", async () => {
  vi.mocked(authClient.setContactDiscovery).mockResolvedValue(
    create(UserSchema, { ...UNANSWERED, contactDiscovery: ContactDiscovery.ON }),
  );
  await mount(ContactDiscovery.UNSPECIFIED);
  await press(CONTACT_DISCOVERY_PROMPT.allow);
  expect(authClient.setContactDiscovery).toHaveBeenCalledExactlyOnceWith({ discoverable: true });
  expect(queryClient.getQueryData(queryKeys.me)).toMatchObject({ contactDiscovery: ContactDiscovery.ON });
  await mount(ContactDiscovery.ON);
  expect(container.textContent).toBe(CONTACT_DISCOVERY_PROMPT.allowedNotice);
});

it("shows a failed save beside the buttons and keeps asking", async () => {
  vi.mocked(authClient.setContactDiscovery).mockRejectedValue(new Error("You're offline"));
  await mount(ContactDiscovery.UNSPECIFIED);
  await press(CONTACT_DISCOVERY_PROMPT.decline);
  expect(container.querySelector("[role=alert]")?.textContent).toBe("You're offline");
  expect(container.textContent).toContain(CONTACT_DISCOVERY_PROMPT.allow);
});

it("renders nothing for someone who already answered", async () => {
  await mount(ContactDiscovery.ON);
  expect(container.innerHTML).toBe("");
});

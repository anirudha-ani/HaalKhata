/** @vitest-environment jsdom */
/** Adding somebody not on HaalKhata: the invite-link offer says why sharing its link failed, under its button, and lets it be tried again. */

import { Code, ConnectError } from "@connectrpc/connect";
import { NOT_ON_HAALKHATA_COPY } from "@haalkhata/shared/invite/inviteCopy";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { socialClient } from "@/lib/api/connect";
import { useGroupDetail, type GroupDetailController } from "../../hooks/useGroupDetail";
import { AddPeopleSheet } from "./AddPeopleSheet";

const PRIYA = { mode: "email", email: "priya@example.com", region: "US", nationalNumber: "" } as const;
const REFUSAL = "nobody on HaalKhata has that email or phone";
const OFFLINE = "Couldn’t reach HaalKhata. Check your connection and try again.";

const groupAPI = vi.hoisted(() => ({ addMembers: { mutate: vi.fn(), isPending: false } }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock("lucide-react-native", () => ({ X: () => null }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native", () => ({
  AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove: () => undefined }) },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  Platform: { OS: "ios", select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  Modal: ({ children }: { children: ReactNode }) => createElement("div", { role: "dialog" }, children),
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  ScrollView: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Text: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) =>
    createElement("span", { role: accessibilityRole }, children),
  Pressable: ({ children, onPress, disabled }: { children: ReactNode; onPress: () => void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, children),
  ActivityIndicator: () => createElement("span", null, "Working"),
}));
// The form's own fields are not what is under test: a stand-in types the
// contact the way the real field reports it.
vi.mock("@/components/ui/EmailOrPhoneField", () => ({
  EmailOrPhoneField: ({ onContactChange }: { onContactChange: (contact: typeof PRIYA) => void }) =>
    createElement("button", { onClick: () => onContactChange(PRIYA) }, "Type Priya’s email"),
}));
vi.mock("@/components/people/PersonChecklist", () => ({ PersonChecklist: () => null }));
vi.mock("@/lib/invite/share", () => ({ shareInvite: vi.fn() }));
vi.mock("@/lib/api/connect", () => ({
  socialClient: { createGroupInviteLink: vi.fn(), revokeGroupInviteLink: vi.fn() },
  errorMessage: (error: Error) => error.message,
}));
vi.mock("../../hooks/useGroupDetailAPI", () => {
  const idle = { mutate: () => undefined, isPending: false, variables: undefined };
  return {
    useGroupDetailAPI: () => ({
      me: { id: "user-sara", name: "Sara" },
      group: { id: "grp-flat", name: "Flat 4B", currency: "USD", members: [] },
      friends: [],
      balances: undefined,
      addMembers: groupAPI.addMembers,
      removeMember: idle,
      transferOwnership: idle,
      addFriend: idle,
      setSimplify: idle,
      setStatus: idle,
    }),
  };
});

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
let screen: GroupDetailController;

/**
 * The group screen's controller with its add-people sheet, mounted the way
 * the screen mounts it: only while it is open.
 *
 * @returns The sheet, or a marker while it is closed.
 */
function Harness() {
  screen = useGroupDetail("grp-flat");
  return screen.addingPeople
    ? createElement(AddPeopleSheet, { groupDetail: screen, groupName: "Flat 4B" })
    : createElement("p", null, "Sheet closed");
}

/** @returns Waits for React Query to settle and the screen to re-render. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * Finds a visible button by its words.
 *
 * @param label - The button's text.
 * @returns The button.
 */
function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((element) => element.textContent === label);
  expect(found, label).toBeDefined();
  return found!;
}

/**
 * Taps a visible button.
 *
 * @param label - The button's text.
 */
async function press(label: string) {
  await act(async () => button(label).click());
  await settle();
}

/** @returns The text of every alert on screen, in order. */
function alerts(): string[] {
  return Array.from(container.querySelectorAll('[role="alert"]')).map((element) => element.textContent ?? "");
}

/** Opens the sheet, types Priya's email and asks to add her, which brings up the invite-link offer. */
async function offerPriyaTheLink() {
  await act(async () => screen.setAddingPeople(true));
  await press("Type Priya’s email");
  await press("Add to group");
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  groupAPI.addMembers.mutate.mockImplementation((_variables, options: { onError: (error: unknown) => void }) =>
    options.onError(new ConnectError(REFUSAL, Code.FailedPrecondition)),
  );
  vi.mocked(socialClient.createGroupInviteLink).mockRejectedValue(new Error(OFFLINE));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Harness))));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("the invite-link offer in the add-people sheet", () => {
  it("answers a contact nobody on HaalKhata has with the offer alone, not the refusal as well", async () => {
    await offerPriyaTheLink();

    expect(alerts()).toEqual([NOT_ON_HAALKHATA_COPY.group.message]);
    expect(container.textContent).not.toContain(REFUSAL);
  });

  it("says why sharing the link failed, under its button, and shares it on the next try", async () => {
    await offerPriyaTheLink();

    await press(NOT_ON_HAALKHATA_COPY.group.action);

    expect(alerts()).toEqual([NOT_ON_HAALKHATA_COPY.group.message, OFFLINE]);
    const failure = Array.from(container.querySelectorAll('[role="alert"]')).find((element) => element.textContent === OFFLINE)!;
    // Beside the button that failed: after it, before the offer's Cancel.
    expect(button(NOT_ON_HAALKHATA_COPY.group.action).compareDocumentPosition(failure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(failure.compareDocumentPosition(button("Cancel")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    vi.mocked(socialClient.createGroupInviteLink).mockResolvedValue({ token: "flat-link", expiresAt: "2026-11-05T10:00:00Z" } as never);
    await press(NOT_ON_HAALKHATA_COPY.group.action);

    expect(container.textContent).toBe("Sheet closed");
    expect(screen.groupShareToken).toBe("flat-link");
  });

  it("takes the failure away with the offer, and does not keep it for the next time the sheet opens", async () => {
    await offerPriyaTheLink();
    await press(NOT_ON_HAALKHATA_COPY.group.action);
    await press("Cancel");
    expect(alerts()).toEqual([]);

    await press("Add to group");
    await press(NOT_ON_HAALKHATA_COPY.group.action);
    expect(alerts()).toContain(OFFLINE);
    await act(async () => screen.setAddingPeople(false));
    await act(async () => screen.setAddingPeople(true));

    expect(alerts()).toEqual([NOT_ON_HAALKHATA_COPY.group.message]);
  });
});

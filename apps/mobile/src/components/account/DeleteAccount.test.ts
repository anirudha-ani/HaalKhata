/** @vitest-environment jsdom */
/** Account deletion reviews fresh balances without making settlement or a working balance read mandatory. */

import { create } from "@bufbuild/protobuf";
import { OverallBalancesResponseSchema } from "@haalkhata/protogen/expense/v1/expense_pb";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient, expenseClient } from "@/lib/api/connect";
import { DeleteAccount } from "./DeleteAccount";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/api/session", () => ({ clearSession: vi.fn() }));
vi.mock("@/lib/api/queryCache", () => ({ clearMobileQueryCache: vi.fn() }));
vi.mock("@/lib/push/pushStore", () => ({ clearPushTraces: vi.fn() }));
// Keep the component and query hooks real; replace native host views and the sheet shell.
vi.mock("react-native", () => ({
  AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove: () => undefined }) },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  Platform: { select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children, accessibilityLabel }: { children: ReactNode; accessibilityLabel?: string }) =>
    createElement("div", { "aria-label": accessibilityLabel }, children),
  Text: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) =>
    createElement("span", { role: accessibilityRole === "alert" ? "alert" : undefined }, children),
  Pressable: ({ children, disabled, onPress }: { children: ReactNode; disabled: boolean; onPress: () => void }) =>
    createElement("button", { disabled, onClick: onPress }, children),
  ActivityIndicator: () => createElement("span", null, "Working…"),
  TextInput: ({ value, onChangeText, editable }: { value: string; onChangeText: (value: string) => void; editable: boolean }) =>
    createElement("input", { value, disabled: editable === false,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value) }),
}));
vi.mock("@/components/ui/Sheet/Sheet", () => ({
  Sheet: ({ children, footer }: { children: ReactNode; footer: ReactNode }) =>
    createElement("div", { role: "dialog" }, children, footer),
}));
vi.mock("@/lib/api/connect", () => ({
  authClient: { deleteAccount: vi.fn() },
  expenseClient: { getOverallBalances: vi.fn() },
  errorMessage: (error: Error) => error.message,
}));

const OUTSTANDING = create(OverallBalancesResponseSchema, { totals: [
  { currency: "USD", youOweCents: 1250, owedToYouCents: 1250 },
  { currency: "EUR", youOweCents: 0, owedToYouCents: 800 },
] });
const SETTLED = create(OverallBalancesResponseSchema);
let queryClient: QueryClient;
let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  queryClient.setQueryData(queryKeys.overallBalances, SETTLED);
  vi.mocked(expenseClient.getOverallBalances).mockResolvedValue(OUTSTANDING);
  vi.mocked(authClient.deleteAccount).mockRejectedValue(new Error("Deletion failed; try again"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(DeleteAccount))));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

/** @param label Visible button text. @returns The matching enabled or disabled control. */
function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((element) => element.textContent === label);
  expect(found, label).toBeDefined();
  return found!;
}

/** @param label Button to click. @returns Resolves after React Query's queued updates. */
async function click(label: string) {
  await act(async () => {
    button(label).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** @param value The confirmation text entered by the user. */
function typeConfirmation(value: string) {
  const input = container.querySelector("input")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("account deletion balance review", () => {
  it("fetches only on open and replaces cached zeros with separate payable and receivable amounts", async () => {
    expect(expenseClient.getOverallBalances).not.toHaveBeenCalled();
    await click("Delete account");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(expenseClient.getOverallBalances).toHaveBeenCalledTimes(1);
    const review = container.querySelector('[aria-label="Balances before deletion"]')!;
    expect(review.textContent).toContain("USD");
    expect(review.textContent).toContain("EUR");
    expect(review.textContent).toContain("You owe: $12.50");
    expect(review.textContent).toContain("You are owed: $12.50");
    expect(review.textContent).toContain("You owe: €0.00");
    expect(review.textContent).toContain("You are owed: €8.00");
    expect(button("Delete anyway").disabled).toBe(true);
  });

  it("takes Review balances to the dashboard without submitting deletion", async () => {
    await click("Delete account");
    await click("Review balances");
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/dashboard");
    expect(authClient.deleteAccount).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("allows deletion with outstanding balances only after typed confirmation, and keeps failures visible", async () => {
    await click("Delete account");
    typeConfirmation("delete");
    expect(button("Delete anyway").disabled).toBe(true);
    typeConfirmation("DELETE");
    await click("Delete anyway");
    expect(authClient.deleteAccount).toHaveBeenCalledExactlyOnceWith({ confirmation: "DELETE" });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Deletion failed; try again");
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("shows a failed balance lookup instead of cached zeros, permits deletion and offers retry", async () => {
    vi.mocked(expenseClient.getOverallBalances).mockRejectedValue(new Error("Offline"));
    await click("Delete account");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain("We couldn't verify your balances");
    expect(container.textContent).not.toContain("no outstanding balances");
    typeConfirmation("DELETE");
    expect(button("Delete anyway").disabled).toBe(false);
    vi.mocked(expenseClient.getOverallBalances).mockResolvedValue(OUTSTANDING);
    await click("Retry balance check");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain("$12.50");
    expect(container.textContent).not.toContain("We couldn't verify your balances");
  });

  it("does not show a cached zero as verified when offline pauses the balance request", async () => {
    onlineManager.setOnline(false);
    await click("Delete account");
    expect(expenseClient.getOverallBalances).not.toHaveBeenCalled();
    expect(container.textContent).toContain("We couldn't verify your balances");
    expect(container.textContent).not.toContain("no outstanding balances");
    typeConfirmation("DELETE");
    expect(button("Delete anyway").disabled).toBe(false);
  });

  it("refreshes on reopening after settlement and resets the destructive confirmation", async () => {
    await click("Delete account");
    typeConfirmation("DELETE");
    await click("Keep my account");
    vi.mocked(expenseClient.getOverallBalances).mockResolvedValue(SETTLED);
    await click("Delete account");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(expenseClient.getOverallBalances).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("no outstanding balances");
    expect(button("Permanently delete account").disabled).toBe(true);
    expect(container.querySelector("input")?.value).toBe("");
  });

  it("does not show stale balances or block deletion when the balance request stays pending", async () => {
    vi.mocked(expenseClient.getOverallBalances).mockReturnValue(new Promise(() => {}));
    await click("Delete account");
    expect(container.textContent).toContain("Checking your balances");
    expect(container.textContent).not.toContain("no outstanding balances");
    typeConfirmation("DELETE");
    await click("Delete anyway");
    expect(authClient.deleteAccount).toHaveBeenCalledExactlyOnceWith({ confirmation: "DELETE" });
  });
});

/** @vitest-environment jsdom */
/** Account withdrawal updates the scan cache only after server success and shows failures beside the action. */

import { create } from "@bufbuild/protobuf";
import { ReceiptProcessingInfoSchema } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { receiptClient } from "@/lib/api/connect";
import { ReceiptPermission } from "./ReceiptPermission";

vi.mock("@/lib/api/connect", () => ({ receiptClient: { getProcessingInfo: vi.fn(), revokeConsent: vi.fn() },
  errorMessage: (error: Error) => error.message }));
vi.mock("react-native", () => ({
  Platform: { select: (options: { default: string }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Text: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) => createElement("span", { role: accessibilityRole }, children),
}));
vi.mock("@/components/ui/Button", () => ({ Button: ({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) =>
  createElement("button", { onClick: onPress, disabled: busy }, label) }));
const ALLOWED = create(ReceiptProcessingInfoSchema, { disclosure: "Send to OpenRouter and Google", consentVersion: "current", consentGranted: true });
let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(receiptClient.getProcessingInfo).mockResolvedValue(ALLOWED);
  vi.mocked(receiptClient.revokeConsent).mockResolvedValue(create(ReceiptProcessingInfoSchema, { ...ALLOWED, consentGranted: false }));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(queryKeys.receiptProcessingInfo, ALLOWED);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(ReceiptPermission))); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); queryClient.clear(); onlineManager.setOnline(true); vi.unstubAllGlobals(); });
/** @returns Completes the real withdrawal button action and scheduled query updates. */
async function withdraw() {
  await act(async () => { container.querySelector("button")!.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
}
it("withdraws once, updates cached permission, and visibly confirms future scans will ask again", async () => {
  expect(container.textContent).toContain("OpenRouter and Google");
  await withdraw();
  expect(receiptClient.revokeConsent).toHaveBeenCalledWith({});
  expect(queryClient.getQueryData(queryKeys.receiptProcessingInfo)).toMatchObject({ consentGranted: false });
  expect(container.textContent).toContain("Permission withdrawn");
  expect(container.textContent).not.toContain("Withdraw permission");
});
it("failed withdrawal stays visibly allowed and can be retried", async () => {
  vi.mocked(receiptClient.revokeConsent).mockRejectedValueOnce(new Error("Could not withdraw permission"));
  await withdraw();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not withdraw permission");
  expect(queryClient.getQueryData(queryKeys.receiptProcessingInfo)).toMatchObject({ consentGranted: true });
  expect(container.textContent).toContain("Withdraw permission");
  await withdraw(); expect(container.textContent).toContain("Permission withdrawn");
});

it("offline withdrawal shows a failure and is not queued for reconnect", async () => {
  onlineManager.setOnline(false); await withdraw();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("offline");
  expect(receiptClient.revokeConsent).not.toHaveBeenCalled();
  expect(queryClient.getQueryData(queryKeys.receiptProcessingInfo)).toMatchObject({ consentGranted: true });
  await act(async () => { onlineManager.setOnline(true); });
  expect(receiptClient.revokeConsent).not.toHaveBeenCalled();
});

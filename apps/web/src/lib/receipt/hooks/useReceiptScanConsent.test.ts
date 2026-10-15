/** @vitest-environment jsdom */
/** Real consent hooks: first use, remembered scans, stale devices, cancellation, and failure recovery. */

import { create } from "@bufbuild/protobuf";
import { ReceiptProcessingInfoSchema } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { receiptClient } from "@/lib/api/connect";
import { useReceiptScanConsent } from "./useReceiptScanConsent";

vi.mock("@/lib/api/connect", () => ({ receiptClient: { getProcessingInfo: vi.fn(), grantConsent: vi.fn(), revokeConsent: vi.fn() },
  errorMessage: (error: Error) => error.message }));
const scan = vi.fn();
let controller: ReturnType<typeof useReceiptScanConsent>;
let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
let serverInfo = create(ReceiptProcessingInfoSchema);

/** @returns A component exposing the actual flow for event-driven tests. */
function Harness() { const flow = useReceiptScanConsent(scan); useEffect(() => { controller = flow; }); return null; }
/** @param expenseKey A fresh key simulates a new expense, with the same signed-in account. */
async function render(expenseKey = "first-photo") {
  await act(async () => { root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Harness, { key: expenseKey }))); });
}
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  serverInfo = create(ReceiptProcessingInfoSchema, { disclosure: "Send to OpenRouter and Google", consentVersion: "version-one" });
  vi.mocked(receiptClient.getProcessingInfo).mockImplementation(async () => serverInfo);
  vi.mocked(receiptClient.grantConsent).mockImplementation(async () => { serverInfo = create(ReceiptProcessingInfoSchema, { ...serverInfo, consentGranted: true }); return serverInfo; });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await render();
});
afterEach(() => { act(() => root.unmount()); container.remove(); queryClient.clear(); onlineManager.setOnline(true); vi.unstubAllGlobals(); });

it("opens only on an explicit scan and requires Allow before calling the scanner", async () => {
  expect(controller.prompt).toBeNull(); expect(scan).not.toHaveBeenCalled();
  await act(async () => controller.request());
  expect(controller.prompt?.disclosure).toContain("OpenRouter and Google"); expect(scan).not.toHaveBeenCalled();
  await act(async () => controller.allow());
  expect(receiptClient.grantConsent).toHaveBeenCalledWith({ consentVersion: "version-one" });
  expect(controller.prompt).toBeNull(); expect(scan).toHaveBeenCalledWith("version-one");
});
it("manual entry and dismissal neither grant permission nor scan", async () => {
  await act(async () => controller.request());
  act(() => controller.decline());
  expect(controller.prompt).toBeNull(); expect(receiptClient.grantConsent).not.toHaveBeenCalled(); expect(scan).not.toHaveBeenCalled();
});
it("new photos and new expense forms reuse the account allowance", async () => {
  await act(async () => controller.request()); await act(async () => controller.allow());
  await act(async () => controller.request());
  await render("another-expense"); await act(async () => controller.request());
  expect(receiptClient.grantConsent).toHaveBeenCalledTimes(1); expect(scan).toHaveBeenCalledTimes(3); expect(controller.prompt).toBeNull();
});
it("checks the server before scanning when another device has withdrawn permission", async () => {
  queryClient.setQueryData(queryKeys.receiptProcessingInfo, create(ReceiptProcessingInfoSchema, { ...serverInfo, consentGranted: true }));
  await act(async () => controller.request());
  expect(controller.prompt).not.toBeNull(); expect(scan).not.toHaveBeenCalled();
});
it("shows status-read failures without scanning from a cached allowance", async () => {
  queryClient.setQueryData(queryKeys.receiptProcessingInfo, create(ReceiptProcessingInfoSchema, { ...serverInfo, consentGranted: true }));
  vi.mocked(receiptClient.getProcessingInfo).mockRejectedValue(new Error("Connection lost"));
  await act(async () => controller.request());
  expect(controller.error).toBe("Connection lost"); expect(scan).not.toHaveBeenCalled();
});
it("failed or obsolete grants show the latest disclosure and still require an explicit Allow", async () => {
  await act(async () => controller.request());
  serverInfo = create(ReceiptProcessingInfoSchema, { disclosure: "New recipients", consentVersion: "version-two" });
  vi.mocked(receiptClient.grantConsent).mockRejectedValueOnce(new Error("Details changed"));
  await act(async () => controller.allow());
  expect(controller.error).toBe("Details changed"); expect(controller.prompt?.disclosure).toBe("New recipients"); expect(scan).not.toHaveBeenCalled();
  await act(async () => controller.allow());
  expect(scan).toHaveBeenCalledWith("version-two");
});
it("coalesces double taps before permission is read", async () => {
  await act(async () => { await Promise.all([controller.request(), controller.request()]); });
  await act(async () => { await Promise.all([controller.allow(), controller.allow()]); });
  expect(receiptClient.grantConsent).toHaveBeenCalledTimes(1); expect(scan).toHaveBeenCalledTimes(1);
});

it("offline scans fail visibly without queuing an upload for reconnection", async () => {
  onlineManager.setOnline(false);
  await act(async () => controller.request());
  expect(controller.error).toContain("offline"); expect(controller.busy).toBe(false); expect(scan).not.toHaveBeenCalled();
  await act(async () => { onlineManager.setOnline(true); });
  expect(scan).not.toHaveBeenCalled();
});
it("offline allowance is not saved or replayed when connectivity returns", async () => {
  await act(async () => controller.request()); onlineManager.setOnline(false);
  await act(async () => controller.allow());
  expect(controller.error).toContain("offline"); expect(controller.busy).toBe(false);
  expect(receiptClient.grantConsent).not.toHaveBeenCalled(); expect(scan).not.toHaveBeenCalled();
  await act(async () => { onlineManager.setOnline(true); });
  expect(receiptClient.grantConsent).not.toHaveBeenCalled(); expect(scan).not.toHaveBeenCalled();
});

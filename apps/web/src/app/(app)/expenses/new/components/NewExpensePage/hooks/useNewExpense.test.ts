/** @vitest-environment jsdom */
/** Browser expense workflow regression tests using the real controller and shared money logic. */
import { create } from "@bufbuild/protobuf";
import { UserSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { ExpenseSchema, GetExpenseResponseSchema } from "@haalkhata/protogen/expense/v1/expense_pb";
import { computeSplits } from "@haalkhata/shared/expense/splits";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildInitialValues } from "../../../utils/initialValues";
import { useNewExpense } from "./useNewExpense";
import type { useNewExpenseAPI } from "./useNewExpenseAPI";
import { ReceiptPanel } from "../components/ReceiptPanel/ReceiptPanel";

const stubs = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), replace: vi.fn(), parse: vi.fn(), prepare: vi.fn(async (file: File) => file) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: stubs.replace, push: stubs.replace }) }));
vi.mock("@/lib/api/connect", () => ({ errorMessage: (error: Error) => error.message }));
vi.mock("@/lib/operations/operationId", () => ({ newOperationId: () => crypto.randomUUID() }));
vi.mock("@/lib/receipt/hooks/useReceiptScanConsent", () => ({ useReceiptScanConsent: (scan: (version: string) => void) => ({ busy: false, prompt: null, request: async () => scan("current-version") }) }));

const alice = create(UserSchema, { id: "alice", name: "Alice", defaultCurrency: "USD", registered: true });
const friend = create(UserSchema, { id: "friend", name: "Friend", defaultCurrency: "USD", registered: true });
let controller: ReturnType<typeof useNewExpense>;
vi.mock("@/lib/image/receiptImage", () => ({ prepareReceiptImage: stubs.prepare }));

let root: Root;
let container: HTMLDivElement;

/** @param saved Existing expense, when editing. @returns Harness running the actual browser hook. */
function Harness({ saved }: { saved?: ReturnType<typeof create<typeof ExpenseSchema>> }) {
  const initial = buildInitialValues({ initialGroupId: "", initialFriendId: friend.id }, alice.id, saved);
  const expenseAPI = {
    me: alice, groups: [], friends: [{ user: friend }],
    editing: saved ? create(GetExpenseResponseSchema, { expense: saved, users: [alice, friend] }) : undefined,
    create: { mutate: stubs.create, isPending: false }, update: { mutate: stubs.update, isPending: false }, parse: { mutate: stubs.parse, isPending: false },
  } as unknown as ReturnType<typeof useNewExpenseAPI>;
  const value = useNewExpense(expenseAPI, initial, saved?.id ?? "");
  useEffect(() => { controller = value; });
  return createElement(ReceiptPanel, { form: value });
}

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:normalized-receipt");
    static revokeObjectURL = vi.fn();
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it.each(["equal", "exact", "percent", "shares"] as const)("submits valid %s inputs with exact server-recomputable totals", async (splitType) => {
  await act(async () => root.render(createElement(Harness)));
  act(() => {
    controller.setDescription("Dinner"); controller.setAmount("10.01"); controller.setSplitType(splitType);
    controller.setSplitInputs(splitType === "exact" ? { alice: "3.33", friend: "6.68" } : splitType === "percent" ? { alice: "33.33", friend: "66.67" } : { alice: "1", friend: "2" });
    controller.setMultiPayer(true); controller.setPayerAmounts({ alice: "6.00", friend: "4.01" });
  });
  expect(controller.canSubmit).toBe(true);
  act(() => controller.submit());
  const payload = stubs.create.mock.calls[0][0];
  expect(payload.payers.reduce((total: number, payer: { amountCents: number }) => total + payer.amountCents, 0)).toBe(1001);
  expect(computeSplits(payload.splitType, payload.amountCents, payload.splitSpecs).reduce((total, split) => total + split.owedCents, 0)).toBe(1001);
});

it("keeps the operation id when retrying a failed request and retains the draft", async () => {
  await act(async () => root.render(createElement(Harness)));
  act(() => { controller.setDescription("Retry dinner"); controller.setAmount("10"); });
  act(() => controller.submit());
  const [first, callbacks] = stubs.create.mock.calls[0];
  act(() => callbacks.onError(new Error("Connection lost")));
  expect(controller.description).toBe("Retry dinner"); expect(controller.error).toBe("Connection lost");
  act(() => controller.submit());
  expect(stubs.create.mock.calls[1][0].operationId).toBe(first.operationId);
});

it.each(["percent", "shares"])("edits a saved %s expense without changing currency or allocations", async (splitType) => {
  const saved = create(ExpenseSchema, { id: "saved", description: "Yen dinner", amountCents: 1001, currency: "JPY", splitType,
    payers: [{ userId: "alice", amountCents: 1001 }], splits: [{ userId: "alice", owedCents: 333 }, { userId: "friend", owedCents: 668 }] });
  await act(async () => root.render(createElement(Harness, { saved })));
  expect(controller.currency).toBe("JPY"); expect(controller.totalCents).toBe(1001);
  expect(controller.splitNotice).toBeTruthy(); expect(controller.canSubmit).toBe(true);
  act(() => { controller.setNotes("Edited note only"); });
  act(() => controller.submit());
  expect(stubs.update.mock.calls[0][0].preserveSplitType).toBe(true);
  const payload = stubs.update.mock.calls[0][0].expense;
  expect(payload.currency).toBe("JPY"); expect(payload.amountCents).toBe(1001);
  expect(payload.splitSpecs.map((split: { amountCents: number }) => split.amountCents)).toEqual([333, 668]);
});

it("shows why a photo the browser cannot read was refused, and keeps no file to send", async () => {
  stubs.prepare.mockRejectedValueOnce(new Error("Couldn't read this photo. Try another one, or a screenshot of the receipt."));
  await act(async () => root.render(createElement(Harness)));

  await act(async () => controller.pickFile(new File(["heic"], "receipt.heic", { type: "image/heic" })));

  expect(controller.error).toContain("Couldn't read this photo");
  expect(controller.file).toBeNull();
  expect(controller.isPreparing).toBe(false);
  expect(stubs.parse).not.toHaveBeenCalled();
});

it("retains the normalized preview and draft on a currency mismatch", async () => {
  await act(async () => root.render(createElement(Harness)));
  act(() => { controller.setDescription("Manual meal"); controller.setAmount("12"); });
  await act(async () => controller.pickFile(new File(["heic"], "receipt.heic", { type: "image/heic" })));
  act(() => controller.parseNow());
  const [request, callbacks] = stubs.parse.mock.calls[0];
  expect(request.currency).toBe("USD");
  act(() => callbacks.onSuccess({ provider: "compatible", normalizedImage: new Uint8Array([0xff, 0xd8, 0xff]),
    receipt: { currency: "JPY", merchant: "Other meal", items: [], date: "", taxCents: 0, tipCents: 0 } }));
  expect(controller.receiptUrl).toBe("blob:normalized-receipt");
  expect(controller.error).toContain("receipt is in JPY");
  expect(controller.description).toBe("Manual meal"); expect(controller.amount).toBe("12");
  expect(container.querySelector('img[alt="Receipt"]')?.getAttribute("src")).toBe("blob:normalized-receipt");
  expect(container.textContent).toContain("Itemize with AI");
  expect(container.textContent).not.toContain("auto-itemized");
});

it.each(["person", "group"])("clears the saved-split notice after changing the %s", async (change) => {
  const saved = create(ExpenseSchema, { id: "saved", description: "Dinner", amountCents: 1000, currency: "USD", splitType: "shares",
    payers: [{ userId: "alice", amountCents: 1000 }], splits: [{ userId: "alice", owedCents: 500 }, { userId: "friend", owedCents: 500 }] });
  await act(async () => root.render(createElement(Harness, { saved })));
  expect(controller.splitNotice).toBeTruthy();
  act(() => change === "person" ? controller.togglePerson("friend") : controller.setGroupId(""));
  expect(controller.splitNotice).toBeUndefined();
});

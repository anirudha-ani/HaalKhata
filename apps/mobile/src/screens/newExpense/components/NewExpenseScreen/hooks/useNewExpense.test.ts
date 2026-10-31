/** @vitest-environment jsdom */
/** Native expense workflow regression tests using the real controller and shared money logic. */
import { create } from "@bufbuild/protobuf";
import { createPlain } from "@haalkhata/shared/api/wireNumbers";
import type { Expense } from "@haalkhata/shared/api/plainMessages";
import { UserSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { ExpenseSchema, GetExpenseResponseSchema } from "@haalkhata/protogen/expense/v1/expense_pb";
import { computeSplits } from "@haalkhata/shared/expense/splits";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildInitialValues } from "../../../utils/initialValues";
import { useNewExpense } from "./useNewExpense";
import type { useNewExpenseAPI } from "./useNewExpenseAPI";

const stubs = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), replace: vi.fn(), dismissTo: vi.fn(), cameraPermission: vi.fn(), camera: vi.fn(), library: vi.fn(), parse: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace: stubs.replace, dismissTo: stubs.dismissTo }) }));
vi.mock("expo-image-picker", () => ({ requestCameraPermissionsAsync: stubs.cameraPermission, launchCameraAsync: stubs.camera, launchImageLibraryAsync: stubs.library }));
vi.mock("@/lib/api/connect", () => ({ errorMessage: (error: Error) => error.message }));
vi.mock("@/lib/api/operationId", () => ({ newOperationId: () => crypto.randomUUID() }));
vi.mock("@/lib/receipt/hooks/useReceiptScanConsent", () => ({ useReceiptScanConsent: (scan: (version: string) => void) => ({ busy: false, prompt: null, request: async () => scan("current-version") }) }));
vi.mock("../../../utils/prepareReceiptPhoto", () => ({ prepareReceiptPhoto: vi.fn(async () => ({ uri: "file:///test-receipt.jpg", base64: "jpeg", mediaType: "image/jpeg" })) }));

const alice = create(UserSchema, { id: "alice", name: "Alice", defaultCurrency: "USD", registered: true });
const friend = create(UserSchema, { id: "friend", name: "Friend", defaultCurrency: "USD", registered: true });
let controller: ReturnType<typeof useNewExpense>;
let root: Root;
let container: HTMLDivElement;

/** @param saved Existing expense, when editing. @returns Harness running the actual native hook. */
function Harness({ saved }: { saved?: Expense }) {
  const initial = buildInitialValues({ initialGroupId: "", initialFriendId: friend.id }, alice.id, saved);
  const expenseAPI = {
    me: alice, groups: [], friends: [{ user: friend }],
    editing: saved ? createPlain(GetExpenseResponseSchema, { expense: saved, users: [alice, friend] }) : undefined,
    create: { mutate: stubs.create, isPending: false }, update: { mutate: stubs.update, isPending: false }, parse: { mutate: stubs.parse, isPending: false },
    startLive: { mutate: vi.fn(), isPending: false },
  } as unknown as ReturnType<typeof useNewExpenseAPI>;
  const value = useNewExpense(expenseAPI, initial, saved?.id ?? "");
  useEffect(() => { controller = value; });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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

it("saves a bill with only the person adding it", async () => {
  await act(async () => root.render(createElement(Harness)));
  act(() => controller.togglePerson("friend"));
  act(() => { controller.setDescription("Lunch"); controller.setAmount("12.00"); });
  expect(controller.friendIds).toEqual([]);
  expect(controller.canSubmit).toBe(true);
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
  const saved = createPlain(ExpenseSchema, { id: "saved", description: "Yen dinner", amountCents: 1001, currency: "JPY", splitType,
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

it("keeps manual entry available when camera permission is denied", async () => {
  stubs.cameraPermission.mockResolvedValue({ granted: false });
  await act(async () => root.render(createElement(Harness)));
  await act(async () => controller.pickPhoto(true));
  expect(controller.error).toContain("Camera access is disabled"); expect(stubs.camera).not.toHaveBeenCalled();
  act(() => { controller.setDescription("Manual meal"); controller.setAmount("12"); });
  expect(controller.canSubmit).toBe(true); expect(controller.photo).toBeNull();
});

it("lands on the expense it just made", async () => {
  await act(async () => root.render(createElement(Harness)));
  act(() => { controller.setDescription("Dinner"); controller.setAmount("10"); });
  act(() => controller.submit());
  act(() => stubs.create.mock.calls[0][1].onSuccess({ id: "made" }));
  expect(stubs.replace).toHaveBeenCalledWith("/expenses/made");
});

it("goes back to the bill an edit was opened from", async () => {
  const saved = createPlain(ExpenseSchema, { id: "saved", description: "Dinner", amountCents: 1000, currency: "USD", splitType: "equal",
    payers: [{ userId: "alice", amountCents: 1000 }], splits: [{ userId: "alice", owedCents: 500 }, { userId: "friend", owedCents: 500 }] });
  await act(async () => root.render(createElement(Harness, { saved })));
  act(() => controller.setDescription("Supper"));
  act(() => controller.submit());
  act(() => stubs.update.mock.calls[0][1].onSuccess({ id: "saved" }));
  expect(stubs.dismissTo).toHaveBeenCalledWith("/expenses/saved");
  expect(stubs.replace).not.toHaveBeenCalled();
});

it("preserves manual itemized edits when the photo picker is cancelled", async () => {
  stubs.library.mockResolvedValue({ canceled: true });
  await act(async () => root.render(createElement(Harness)));
  act(() => {
    controller.setDescription("Manual itemized meal"); controller.setSplitType("itemized");
    controller.itemDraft.replace([{ key: "meal", name: "Meal", quantity: 1, total: "9.01", assignees: { alice: 1, friend: 2 } }], "0.50", "0.50");
  });
  await act(async () => controller.pickPhoto(false));
  expect(controller.totalCents).toBe(1001); expect(controller.canSubmit).toBe(true);
  act(() => controller.submit());
  const payload = stubs.create.mock.calls[0][0];
  expect(payload.items[0].totalCents).toBe(901); expect(payload.taxCents).toBe(50); expect(payload.tipCents).toBe(50);
});

it.each(["JPY", "USD"])("imports a %s receipt only when its currency matches the current form", async (currency) => {
  stubs.library.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///test-receipt.jpg", width: 100, height: 100 }] });
  await act(async () => root.render(createElement(Harness)));
  act(() => { controller.setDescription("Existing draft"); controller.setAmount("10"); });
  await act(async () => controller.pickPhoto(false));
  await act(async () => controller.parseNow());
  const [request, callbacks] = stubs.parse.mock.calls[0];
  expect(request.consentVersion).toBe("current-version");
  expect(request.currency).toBe("USD");
  act(() => callbacks.onSuccess({ provider: "mock", receipt: { merchant: "Receipt", currency, date: "", taxCents: 0, tipCents: 0,
    items: [{ name: "Meal", quantity: 1, totalCents: 1000 }] } }));
  expect(controller.description).toBe("Existing draft");
  if (currency === "JPY") {
    expect(controller.error).toContain("receipt is in JPY");
    expect(controller.splitType).toBe("equal"); expect(controller.itemDraft.items).toEqual([]);
  } else {
    expect(controller.error).toBe(""); expect(controller.splitType).toBe("itemized");
    expect(controller.totalCents).toBe(1000); expect(controller.itemDraft.items?.[0].assignees).toEqual({ alice: 1, friend: 1 });
  }
});


it.each(["person", "group"])("clears the saved-split notice when changing the %s clears inputs", async (change) => {
  const saved = createPlain(ExpenseSchema, { id: "saved", description: "Dinner", amountCents: 1000, currency: "USD", splitType: "shares",
    payers: [{ userId: "alice", amountCents: 1000 }], splits: [{ userId: "alice", owedCents: 500 }, { userId: "friend", owedCents: 500 }] });
  await act(async () => root.render(createElement(Harness, { saved })));
  expect(controller.splitNotice).toBeTruthy();
  act(() => change === "person" ? controller.togglePerson("friend") : controller.setGroupId(""));
  expect(controller.splitNotice).toBeUndefined();
});

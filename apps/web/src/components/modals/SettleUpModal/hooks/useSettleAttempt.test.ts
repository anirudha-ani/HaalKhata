/** @vitest-environment jsdom */
/** A lost reply is answered by sending that same request again, and never by a second payment. */

import { Code, ConnectError } from "@connectrpc/connect";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetAllSettleAttempts,
  rememberSettleAttempt,
  SETTLE_ATTEMPT_LIFETIME_MS,
  SETTLE_CHECK_INTERVAL_MS,
  settleAttemptFor,
} from "@haalkhata/shared/expense/settleAttempt";
import { expenseClient } from "@/lib/api/connect";
import { useSettleAttempt } from "./useSettleAttempt";

vi.mock("@/lib/api/connect", () => ({
  errorMessage: (error: Error) => error.message,
  expenseClient: { recordSettlement: vi.fn() },
}));
vi.mock("@/lib/operations/operationId", () => ({ newOperationId: () => crypto.randomUUID() }));

const record = vi.mocked(expenseClient.recordSettlement);
const onRecorded = vi.fn();
const LOST = new ConnectError("Failed to fetch", Code.Unknown);
const REFUSED = new ConnectError("these balances changed", Code.InvalidArgument);
const PAYMENT = { toUserId: "sara", amountCents: 2000, currency: "USD" } as never;

let settle: ReturnType<typeof useSettleAttempt>;
let root: Root;
let container: HTMLDivElement;

/** Runs the hook for real, for a dialog with Sara. */
function Dialog() {
  const value = useSettleAttempt("sara", onRecorded);
  useEffect(() => {
    settle = value;
  });
  return null;
}

/** Lets everything under way finish: a check starts on the tick after it is needed. */
async function settled() {
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  }
}

/** Opens the dialog. */
async function openDialog() {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Dialog)));
  });
  await settled();
}

/**
 * Sends a payment and lets it play out.
 *
 * @param request - The payment.
 * @param label - Its amount, formatted.
 */
async function sendPayment(request: never = PAYMENT, label = "$20.00") {
  await act(async () => settle.submit(request, label));
  await settled();
}

/** Closes the dialog. */
function closeDialog() {
  act(() => root.unmount());
  root = createRoot(container);
}

/** @returns Every request sent, in order. */
const sent = () => record.mock.calls.map(([request]) => request as { operationId: string; amountCents: number });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  record.mockReset();
  onRecorded.mockReset();
  forgetAllSettleAttempts();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useSettleAttempt", () => {
  it("records a payment and reports it, forgetting the attempt", async () => {
    record.mockResolvedValue({} as never);
    await openDialog();

    await sendPayment();

    expect(onRecorded).toHaveBeenCalledOnce();
    expect(settleAttemptFor("sara")).toBeNull();
    expect(settle.busy).toBe(false);
  });

  it("answers a lost reply with that exact request, and takes the first recording back", async () => {
    record.mockRejectedValueOnce(LOST);
    record.mockResolvedValue({} as never);
    await openDialog();

    await sendPayment();

    expect(sent()).toHaveLength(2);
    expect(sent()[1]).toEqual(sent()[0]);
    expect(onRecorded).toHaveBeenCalledOnce();
  });

  it("says it cannot tell yet, and holds any new payment, while there is no answer", async () => {
    record.mockRejectedValue(LOST);
    await openDialog();

    await sendPayment();

    expect(settle.phase).toBe("unsure");
    expect(settle.status).toContain("$20.00");
    expect(settle.busy).toBe(true);
    const sends = sent().length;
    await sendPayment({ ...(PAYMENT as object), amountCents: 500 } as never, "$5.00");
    expect(sent()).toHaveLength(sends);
  });

  it("keeps asking by itself, always the same request", async () => {
    record.mockRejectedValueOnce(LOST).mockRejectedValueOnce(LOST).mockRejectedValueOnce(LOST);
    record.mockResolvedValue({} as never);
    await openDialog();
    await sendPayment();

    await act(async () => vi.advanceTimersByTime(SETTLE_CHECK_INTERVAL_MS));
    await settled();
    await act(async () => vi.advanceTimersByTime(SETTLE_CHECK_INTERVAL_MS));
    await settled();

    expect(onRecorded).toHaveBeenCalledOnce();
    expect(new Set(sent().map((request) => request.operationId)).size).toBe(1);
  });

  it("checks at once when asked", async () => {
    record.mockRejectedValueOnce(LOST).mockRejectedValueOnce(LOST);
    record.mockResolvedValue({} as never);
    await openDialog();
    await sendPayment();

    await act(async () => settle.checkAgain());
    await settled();

    expect(onRecorded).toHaveBeenCalledOnce();
  });

  it("finishes the same attempt when the dialog is closed and opened again", async () => {
    record.mockRejectedValue(LOST);
    await openDialog();
    await sendPayment();
    const firstId = sent()[0].operationId;
    closeDialog();

    record.mockReset();
    record.mockResolvedValue({} as never);
    await openDialog();

    expect(sent().map((request) => request.operationId)).toEqual([firstId]);
    expect(settle.notice).toContain("$20.00");
    expect(settle.busy).toBe(false);
    expect(settleAttemptFor("sara")).toBeNull();
  });

  it("does not close a dialog opened on an earlier attempt: there may be more to pay", async () => {
    record.mockRejectedValue(LOST);
    await openDialog();
    await sendPayment();
    closeDialog();
    record.mockReset();
    record.mockResolvedValue({} as never);

    await openDialog();

    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("lets somebody try again only after the server has really refused", async () => {
    record.mockRejectedValueOnce(REFUSED);
    await openDialog();

    await sendPayment();

    expect(settle.failure).toContain("these balances changed");
    expect(settle.busy).toBe(false);
    expect(settleAttemptFor("sara")).toBeNull();
  });

  it("gives the next try an id of its own after a refusal", async () => {
    record.mockRejectedValueOnce(REFUSED);
    record.mockResolvedValue({} as never);
    await openDialog();
    await sendPayment();

    await sendPayment();

    expect(sent()[1].operationId).not.toBe(sent()[0].operationId);
  });

  it("says a lost payment was not saved when a repeat is refused", async () => {
    record.mockRejectedValueOnce(LOST).mockRejectedValueOnce(REFUSED);
    await openDialog();

    await sendPayment();

    expect(settle.failure).toContain("wasn’t recorded");
    expect(settle.busy).toBe(false);
  });

  it("does not take a rate limit on a repeat for an answer", async () => {
    record.mockRejectedValueOnce(LOST).mockRejectedValueOnce(new ConnectError("slow down", Code.ResourceExhausted));
    await openDialog();

    await sendPayment();

    expect(settle.busy).toBe(true);
    expect(settleAttemptFor("sara")).not.toBeNull();
  });

  it("warns that an earlier attempt may have landed when the id was already used", async () => {
    record.mockRejectedValueOnce(new ConnectError("used", Code.AlreadyExists));
    await openDialog();

    await sendPayment();

    expect(settle.failure).toContain("may have gone through");
    expect(settleAttemptFor("sara")).toBeNull();
  });

  it("stops sending an attempt the server may have forgotten, and says so", async () => {
    rememberSettleAttempt("sara", {
      request: PAYMENT,
      amountLabel: "$20.00",
      startedAt: Date.now() - SETTLE_ATTEMPT_LIFETIME_MS,
    });

    await openDialog();

    expect(record).not.toHaveBeenCalled();
    expect(settle.failure).toContain("couldn’t confirm");
    expect(settleAttemptFor("sara")).toBeNull();
  });

  it("never sends two at once", async () => {
    let finish: (value: never) => void = () => undefined;
    record.mockRejectedValueOnce(LOST);
    record.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await openDialog();
    await sendPayment();

    await act(async () => vi.advanceTimersByTime(SETTLE_CHECK_INTERVAL_MS * 3));
    await settled();

    expect(sent()).toHaveLength(2);
    await act(async () => finish({} as never));
    await settled();
  });
});

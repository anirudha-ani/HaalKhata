"use client";
/** Records a payment so that a lost reply can never become a second payment. */

import { useCallback, useEffect, useRef, useState } from "react";
import { onlineManager, useMutation, useQueryClient } from "@tanstack/react-query";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import {
  forgetSettleAttempt,
  isSettleAttemptTooOld,
  readSettleFailure,
  rememberSettleAttempt,
  SETTLE_ATTEMPT_TOO_OLD_MESSAGE,
  SETTLE_CHECK_INTERVAL_MS,
  SETTLE_CHECKING_MESSAGE,
  SETTLE_MAY_HAVE_LANDED_MESSAGE,
  SETTLE_OFFLINE_MESSAGE,
  settleAttemptFor,
  settleNotRecordedMessage,
  settleRecordedMessage,
  settleUnsureMessage,
  type SettleAttempt,
} from "@haalkhata/shared/expense/settleAttempt";
import { errorMessage, expenseClient } from "@/lib/api/connect";
import { newOperationId } from "@/lib/operations/operationId";

/** What recording takes, exactly as it is sent. */
type SettleRequest = Parameters<typeof expenseClient.recordSettlement>[0];

/** One send of an attempt. */
interface SettleSend {
  attempt: SettleAttempt<SettleRequest>;
  /** False for the first send, true for a repeat asking how it went. */
  checking: boolean;
}

/** Where a payment stands: nothing under way, sent, being asked about, or asked about without an answer. */
type SettlePhase = "ready" | "sending" | "checking" | "unsure";

/**
 * Records payments with one person. The request is fixed when it is sent, so
 * the balances reloading afterwards cannot change it. When the reply is lost
 * that same request goes again, on its own, until the server answers: it
 * either returns the first recording or records it once. Closing the dialog
 * keeps the attempt, so opening it again finishes that one rather than
 * starting a second.
 *
 * @param personId - Who the payments are with.
 * @param onRecorded - Called when a payment sent from this dialog is recorded.
 * @returns The `phase`, whether a new payment must wait (`busy`), what to say
 *   (`status`, `notice`, `failure`), and `submit` and `checkAgain`.
 */
export function useSettleAttempt(personId: string, onRecorded: () => void) {
  const queryClient = useQueryClient();
  const [earlier] = useState(() => settleAttemptFor<SettleRequest>(personId));
  const [phase, setPhase] = useState<SettlePhase>(earlier ? "checking" : "ready");
  const [amountLabel, setAmountLabel] = useState(earlier?.amountLabel ?? "");
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  // Timers keep asking, and two sends at once would only race each other.
  const sending = useRef(false);

  const { mutate: send } = useMutation({
    mutationFn: async ({ attempt }: SettleSend) => {
      sending.current = true;
      try {
        return await expenseClient.recordSettlement(attempt.request);
      } finally {
        sending.current = false;
      }
    },
    onSuccess: (_saved, { attempt }) => {
      forgetSettleAttempt(personId);
      setPhase("ready");
      for (const moneyKey of MONEY_KEYS) void queryClient.invalidateQueries({ queryKey: moneyKey });
      if (attempt === earlier) setNotice(settleRecordedMessage(attempt.amountLabel));
      else onRecorded();
    },
    onError: (error, { attempt, checking }) => {
      // The balances may not be what the dialog shows any more.
      void queryClient.invalidateQueries({ queryKey: queryKeys.friendLedger(personId) });
      const reading = readSettleFailure(error);
      if (reading === "unknown") {
        setPhase(checking ? "unsure" : "checking");
        return;
      }
      forgetSettleAttempt(personId);
      setPhase("ready");
      if (reading === "mayHaveLanded") setFailure(SETTLE_MAY_HAVE_LANDED_MESSAGE);
      else setFailure(checking ? settleNotRecordedMessage(attempt.amountLabel, errorMessage(error)) : errorMessage(error));
    },
  });

  /** Sends the waiting attempt again, unchanged, unless it is too old to trust. */
  const askAboutAttempt = useCallback(() => {
    const attempt = settleAttemptFor<SettleRequest>(personId);
    if (!attempt) {
      setPhase("ready");
    } else if (isSettleAttemptTooOld(attempt, Date.now())) {
      forgetSettleAttempt(personId);
      setPhase("ready");
      setFailure(SETTLE_ATTEMPT_TOO_OLD_MESSAGE);
    } else if (!sending.current) {
      send({ attempt, checking: true });
    }
  }, [personId, send]);

  useEffect(() => {
    if (phase === "checking") {
      // On the next tick: a dialog opening twice in a row asks once.
      const soon = setTimeout(askAboutAttempt, 0);
      return () => clearTimeout(soon);
    }
    if (phase !== "unsure") return undefined;
    const timer = setInterval(askAboutAttempt, SETTLE_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [phase, askAboutAttempt]);

  /**
   * Sends a new payment, under an id of its own.
   *
   * @param request - The payment, without an id.
   * @param label - Its amount, formatted.
   */
  const submit = (request: SettleRequest, label: string) => {
    if (phase !== "ready") return;
    setNotice("");
    if (!onlineManager.isOnline()) {
      setFailure(SETTLE_OFFLINE_MESSAGE);
      return;
    }
    const attempt: SettleAttempt<SettleRequest> = {
      request: { ...request, operationId: newOperationId() } as SettleRequest,
      amountLabel: label,
      startedAt: Date.now(),
    };
    rememberSettleAttempt(personId, attempt);
    setAmountLabel(label);
    setFailure("");
    setPhase("sending");
    send({ attempt, checking: false });
  };

  return {
    phase,
    busy: phase !== "ready",
    status: phase === "checking" ? SETTLE_CHECKING_MESSAGE : phase === "unsure" ? settleUnsureMessage(amountLabel) : "",
    notice,
    failure,
    submit,
    checkAgain: () => setPhase("checking"),
  };
}

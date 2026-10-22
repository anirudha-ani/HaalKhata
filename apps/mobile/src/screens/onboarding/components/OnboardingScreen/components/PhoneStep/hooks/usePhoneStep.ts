/** The phone step's three stages (number, code, merge) and the discoverability switch that rides along. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { MergePreview } from "@haalkhata/protogen/auth/v1/auth_pb";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { isDiscoverable, onboardingDiscoveryChange } from "@haalkhata/shared/contacts/discovery";
import { INVALID_PHONE_MESSAGE } from "@haalkhata/shared/phone/contact";
import { composeE164, DEFAULT_PHONE_REGION, isValidPhone, splitE164 } from "@haalkhata/shared/phone/phone";
import { authClient, errorMessage, isRefusal } from "@/lib/api/connect";
import { useVerificationCode } from "@/lib/hooks/useVerificationCode";
import { errorFeedback, successFeedback } from "@/lib/motion/haptics";
import { RESEND_DELAY_SECONDS } from "../../../../../constants/onboarding";
import { CODE_STEP } from "../../../../../constants/onboardingCopy";
import { useResendTimer } from "./useResendTimer";

/** Where the phone step is. */
export type PhoneStage = "number" | "code" | "merge";

/**
 * Drives the phone step.
 *
 * Claiming a number can turn up an unclaimed invitation holding it, in which
 * case nothing is written until the person confirms what they would absorb.
 * The number is held as a region plus a national number, matching the two
 * controls that edit it.
 *
 * The "let people find me from their contacts" switch sits here, beside the
 * number it is mostly about. It starts where the account stands (on by
 * default) and is saved however the step ends, including a skip: the person
 * saw it, so wherever they left it is their answer.
 *
 * @param user - The signed-in account.
 * @param onDone - Called when the step ends, with whether the number is now verified.
 * @returns The stage, the fields with setters, every action and the busy and error state.
 */
export function usePhoneStep(user: User, onDone: (verified: boolean) => void) {
  const queryClient = useQueryClient();
  const stored = splitE164(user.phone);
  const [region, setRegion] = useState<string>(stored?.region ?? DEFAULT_PHONE_REGION);
  const [nationalNumber, setNationalNumber] = useState(stored?.nationalNumber ?? "");
  const [findable, setFindable] = useState(isDiscoverable(user.contactDiscovery));
  const [stage, setStage] = useState<PhoneStage>("number");
  const [sentTo, setSentTo] = useState("");
  const codeField = useVerificationCode();
  const [rejections, setRejections] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<MergePreview | undefined>();
  const [mergeToken, setMergeToken] = useState("");
  const resendTimer = useResendTimer(RESEND_DELAY_SECONDS);

  const alreadyVerified = user.phoneVerified && user.phone !== "" && composeE164(region, nationalNumber) === user.phone;

  /** Saves the switch when it differs from what the server holds. */
  const saveDiscovery = async () => {
    const change = onboardingDiscoveryChange(user.contactDiscovery, findable);
    if (change === null) return;
    queryClient.setQueryData(queryKeys.me, await authClient.setContactDiscovery({ discoverable: change }));
  };

  /** Ends the step after the switch is saved. */
  const finish = useMutation({
    mutationFn: async (verified: boolean) => {
      await saveDiscovery();
      return verified;
    },
    onSuccess: (verified) => {
      if (verified) void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      onDone(verified);
    },
    onError: (failure) => setError(errorMessage(failure)),
  });

  const sendCode = useMutation({
    mutationFn: async (phone: string) => authClient.setPhone({ phone, verificationCode: "" }),
    onSuccess: (result, phone) => {
      if (!result.verificationSent) {
        finish.mutate(true);
        return;
      }
      setSentTo(phone);
      codeField.clear();
      setStage("code");
      resendTimer.restart();
    },
    onError: (failure) => setError(errorMessage(failure)),
  });

  const verify = useMutation({
    mutationFn: (entered: string) => authClient.setPhone({ phone: sentTo, verificationCode: entered }),
    onSuccess: (result) => {
      if (result.pendingMerge) {
        setPreview(result.pendingMerge);
        setMergeToken(result.mergeToken);
        setStage("merge");
        return;
      }
      successFeedback();
      finish.mutate(true);
    },
    onError: (failure) => {
      errorFeedback();
      // A refused code is cleared and the boxes shake: sending it again can
      // only be refused again, and the next suggestion the keyboard offers
      // then fills empty boxes instead of landing beside it. After an outage
      // the code is kept, so Verify can simply be pressed again.
      if (isRefusal(failure)) {
        setRejections((count) => count + 1);
        codeField.clear();
      }
      setError(errorMessage(failure));
    },
  });

  const confirmMerge = useMutation({
    mutationFn: () => authClient.confirmPhoneMerge({ mergeToken }),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.me, profile);
      successFeedback();
      finish.mutate(true);
    },
    onError: (failure) => setError(errorMessage(failure)),
  });

  return {
    stage,
    region,
    setRegion,
    nationalNumber,
    setNationalNumber,
    findable,
    setFindable,
    alreadyVerified,
    sentTo,
    code: codeField.code,
    /** True once the boxes hold a whole code. */
    codeComplete: codeField.complete,
    /**
     * Reads a change to the code. A whole code that arrived in one piece
     * (iOS's AutoFill from Messages, or a paste) is checked at once; one of
     * another length came from another message and says so instead.
     */
    enterCode: (text: string) => {
      setNotice("");
      const entry = codeField.enter(text);
      setError(entry.notice);
      if (entry.arrivedWhole && !verify.isPending) verify.mutate(entry.code);
    },
    rejections,
    notice,
    error,
    preview,
    resendIn: resendTimer.remaining,
    busy: sendCode.isPending || verify.isPending || confirmMerge.isPending || finish.isPending,
    /** Sends the code, or moves on when the number shown is already verified. */
    submitNumber: () => {
      setError("");
      setNotice("");
      if (alreadyVerified) {
        finish.mutate(true);
        return;
      }
      // Checked with the same metadata the server uses, so an impossible
      // number fails beside the field instead of costing an SMS round-trip.
      if (!isValidPhone(region, nationalNumber)) {
        setError(INVALID_PHONE_MESSAGE);
        return;
      }
      sendCode.mutate(composeE164(region, nationalNumber));
    },
    /** Checks the code in the boxes. */
    verify: () => {
      setError("");
      setNotice("");
      verify.mutate(codeField.code);
    },
    /** Sends a fresh code to the same number. */
    resend: () => {
      setError("");
      sendCode.mutate(sentTo, { onSuccess: () => setNotice(CODE_STEP.resent) });
    },
    /** Back to the number, keeping what was typed. */
    changeNumber: () => {
      setStage("number");
      codeField.clear();
      setError("");
      setNotice("");
    },
    confirmMerge: () => {
      setError("");
      confirmMerge.mutate();
    },
    /**
     * Leaves both accounts untouched. Only the digits are cleared: the
     * country was almost certainly right, the number belonged to somebody else.
     */
    declineMerge: () => {
      setPreview(undefined);
      setMergeToken("");
      setNationalNumber("");
      setStage("number");
      setError("");
    },
    /** Leaves without a number, still saving the switch. */
    skip: () => {
      setError("");
      finish.mutate(false);
    },
  };
}

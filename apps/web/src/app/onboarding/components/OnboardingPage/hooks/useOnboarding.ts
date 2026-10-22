"use client";
/** First-run flow state: profile fields, the phone claim and its merge confirmation, then the payment step. */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import type { MergePreview } from "@haalkhata/protogen/auth/v1/auth_pb";
import { authClient, errorMessage, isRefusal } from "@/lib/api/connect";
import { useVerificationCode } from "@/lib/hooks/useVerificationCode";
import { composeE164, DEFAULT_PHONE_REGION, isValidPhone, splitE164 } from "@haalkhata/shared/phone/phone";
import { INVALID_PHONE_MESSAGE } from "@haalkhata/shared/phone/contact";

/**
 * Drives the onboarding screen.
 *
 * Phone is deliberately a separate step from the rest of the profile: claiming
 * a number can turn up an unclaimed invitation holding it, in which case
 * nothing is written until the user confirms what they would absorb. The other
 * fields go through the existing UpdateProfile and cannot fail that way.
 *
 * The phone is held as a region plus a national number rather than one string,
 * matching the two controls that edit it; `save` joins them into the E.164 the
 * server stores.
 *
 * The flow has two steps. The profile step (name, phone, currency) ends,
 * however it ends, on the payment step: saved, verified, merged or skipped.
 * Only the payment step leaves onboarding, so everyone is asked once how
 * they want to be paid, and nobody is asked before their currency is known.
 *
 * @returns The step, field values with setters, the code field, the pending
 *   merge preview when one is waiting, actions for saving / verifying /
 *   sending the code again / confirming / skipping / finishing, and the busy
 *   flag.
 */
export function useOnboarding() {
  const queryClient = useQueryClient();

  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  // Phone is held as the two halves the field edits, not as one string: the
  // country is a choice the user makes, and inferring it back out of the text
  // on every keystroke would fight them while they type.
  const [region, setRegion] = useState<string>(DEFAULT_PHONE_REGION);
  const [nationalNumber, setNationalNumber] = useState("");
  const [error, setError] = useState("");
  const [pendingMerge, setPendingMerge] = useState<MergePreview | undefined>();
  const [mergeToken, setMergeToken] = useState("");
  const [verificationPhone, setVerificationPhone] = useState("");
  const codeField = useVerificationCode();
  const [step, setStep] = useState<"profile" | "payment">("profile");

  /** Moves on from the profile step, however it ended, with a clean slate. */
  const toPaymentStep = () => {
    setError("");
    setStep("payment");
  };

  // Seeded from the server exactly once, when the query first resolves. Using
  // state initializers would capture `undefined` on the loading render.
  const [seeded, setSeeded] = useState(false);
  if (meQuery.data && !seeded) {
    setSeeded(true);
    setName(meQuery.data.name);
    setCurrency(meQuery.data.defaultCurrency || "USD");
    // A number already on the account is stored as E.164; split it so the
    // field opens on the country it was entered with.
    const stored = splitE164(meQuery.data.phone);
    if (stored) {
      setRegion(stored.region);
      setNationalNumber(stored.nationalNumber);
    }
  }

  /**
   * Persists completion, then loads a fresh authenticated document. TanStack
   * Query and the App Router maintain separate caches; document navigation
   * reruns the destination's guards against the saved completion state.
   */
  const finish = async () => {
    const completedUser = await authClient.completeOnboarding({});
    queryClient.setQueryData(queryKeys.me, completedUser);
    window.location.replace("/dashboard");
  };

  const save = useMutation({
    mutationFn: async () => {
      setError("");
      await authClient.updateProfile({ name, defaultCurrency: currency });
      // Only touch the phone when it actually changed — resending the same
      // number the account already has is a no-op the server would still
      // process, and an empty field must not clear a number that is set.
      // Comparing in E.164 is what makes that check honest: the same number
      // re-typed with different spacing has to count as unchanged.
      const claimedPhone = composeE164(region, nationalNumber);
      if (claimedPhone.length > 0 && claimedPhone !== meQuery.data?.phone) {
        // Checked with the same libphonenumber metadata the server uses, so
        // an impossible number fails beside the field instead of costing an
        // SMS round-trip to hear the same thing.
        if (!isValidPhone(region, nationalNumber)) throw new Error(INVALID_PHONE_MESSAGE);
        const result = await authClient.setPhone({ phone: claimedPhone, verificationCode: "" });
        if (result.verificationSent) {
          codeField.clear();
          setVerificationPhone(claimedPhone);
        }
        return;
      }
      toPaymentStep();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
    // Settled, not success: the profile write lands before the phone claim,
    // so a refused number still leaves a changed name or currency on the
    // server. Leaving onboarding used to refresh this; the payment step now
    // sits in between, and it must not run on a profile from before the save.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });

  const verifyPhone = useMutation({
    mutationFn: () =>
      authClient.setPhone({ phone: verificationPhone, verificationCode: codeField.code }),
    onSuccess: async (result) => {
      setVerificationPhone("");
      codeField.clear();
      if (result.pendingMerge) {
        setPendingMerge(result.pendingMerge);
        setMergeToken(result.mergeToken);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toPaymentStep();
    },
    onError: (mutationError) => {
      // A refused code is cleared, so the same code cannot be sent again by
      // pressing Verify twice, and the next suggestion the keyboard offers
      // replaces it rather than landing beside it.
      if (isRefusal(mutationError)) codeField.clear();
      setError(errorMessage(mutationError));
    },
  });

  // Texts the code again. Inside its ten minutes it is the same code, under
  // the same verification and its same five tries; the field is cleared so
  // the keyboard can offer the latest text's code.
  const resendCode = useMutation({
    mutationFn: () => authClient.setPhone({ phone: verificationPhone, verificationCode: "" }),
    onSuccess: () => codeField.markResent(),
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const confirmMerge = useMutation({
    mutationFn: async () => {
      setError("");
      await authClient.confirmPhoneMerge({ mergeToken });
      setPendingMerge(undefined);
      toPaymentStep();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });

  /** Backs out of a merge, leaving both accounts untouched and the number unset. */
  const declineMerge = () => {
    setPendingMerge(undefined);
    setMergeToken("");
    // Only the number is cleared. The country stays selected, because it was
    // almost certainly right — it is the digits after it that belonged to
    // somebody else.
    setNationalNumber("");
    setError("");
  };

  const complete = useMutation({
    mutationFn: finish,
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return {
    isLoading: meQuery.isLoading,
    /** Which of the two steps is showing. */
    step,
    name,
    setName,
    currency,
    setCurrency,
    region,
    setRegion,
    nationalNumber,
    setNationalNumber,
    error,
    pendingMerge,
    verificationPhone,
    verificationCode: codeField.code,
    /** True once the field holds a whole code. */
    codeComplete: codeField.complete,
    /** The line under the code field. */
    codeHint: codeField.hint,
    /** Reads a change to the code field; a code that cannot be ours says why. */
    enterVerificationCode: (entered: string) => setError(codeField.enter(entered)),
    verifyPhone: () => {
      setError("");
      verifyPhone.mutate();
    },
    resendCode: () => {
      setError("");
      resendCode.mutate();
    },
    cancelVerification: () => {
      setVerificationPhone("");
      codeField.clear();
      setError("");
    },
    confirmMerge: () => confirmMerge.mutate(),
    declineMerge,
    save: () => save.mutate(),
    /** Leaves the profile step without saving it; the payment step still follows. */
    skip: toPaymentStep,
    /** Marks onboarding done and opens the app; the payment step's one button. */
    complete: () => {
      setError("");
      complete.mutate();
    },
    /** True while a code is being checked. */
    isVerifying: verifyPhone.isPending,
    /** True while the code is being sent again. */
    isResending: resendCode.isPending,
    isPending:
      save.isPending ||
      verifyPhone.isPending ||
      resendCode.isPending ||
      confirmMerge.isPending ||
      complete.isPending,
  };
}

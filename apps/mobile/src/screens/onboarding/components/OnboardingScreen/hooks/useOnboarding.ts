/** First-run flow state: profile fields, the phone claim and its merge confirmation, then the payment step. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MergePreview } from "@haalkhata/protogen/auth/v1/auth_pb";
import { useRouter } from "expo-router";
import { useState } from "react";
import { authClient, errorMessage } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
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
 * @returns The step, field values with setters, the pending merge preview
 *   when one is waiting, actions for saving / verifying / confirming /
 *   skipping / finishing, and the busy flag.
 */
export function useOnboarding() {
  const router = useRouter();
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
  const [verificationCode, setVerificationCode] = useState("");

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

  const [step, setStep] = useState<"profile" | "payment">("profile");

  /** Moves on from the profile step, however it ended, with a clean slate. */
  const toPaymentStep = () => {
    setError("");
    setStep("payment");
  };

  /**
   * Leaves onboarding, marking it done so it never asks again. The profile
   * is re-read into the cache *before* navigating: the authed layout
   * decides from the cached `onboarded` flag, and a stale false would send
   * the user straight back here.
   */
  const finish = async () => {
    await authClient.completeOnboarding({});
    const refreshed = await authClient.getMe({});
    queryClient.setQueryData(queryKeys.me, refreshed);
    router.replace("/dashboard");
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
        if (result.verificationSent) setVerificationPhone(claimedPhone);
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
    mutationFn: () => authClient.setPhone({ phone: verificationPhone, verificationCode }),
    onSuccess: async (result) => {
      setVerificationPhone("");
      setVerificationCode("");
      if (result.pendingMerge) {
        setPendingMerge(result.pendingMerge);
        setMergeToken(result.mergeToken);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toPaymentStep();
    },
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
    isLoading: meQuery.isPending,
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
    verificationCode,
    setVerificationCode,
    verifyPhone: () => verifyPhone.mutate(),
    cancelVerification: () => {
      setVerificationPhone("");
      setVerificationCode("");
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
    isPending:
      save.isPending || verifyPhone.isPending || confirmMerge.isPending || complete.isPending,
  };
}

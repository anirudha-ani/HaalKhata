"use client";
/** First-run flow state: profile fields, the phone claim, and its merge confirmation. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import type { MergePreview } from "@haalkhata/protogen/auth/v1/auth_pb";
import { authClient, errorMessage } from "@/lib/api/connect";
import { composeE164, DEFAULT_PHONE_REGION, splitE164 } from "@haalkhata/shared/phone/phone";

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
 * @returns Field values with setters, the pending merge preview when one is
 *   waiting, actions for saving / confirming / skipping, and the busy flag.
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

  /** Leaves onboarding, marking it done so it never asks again. */
  const finish = async () => {
    await authClient.completeOnboarding({});
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    router.push("/dashboard");
  };

  const save = useMutation({
    mutationFn: async () => {
      setError("");
      await authClient.updateProfile({
        name,
        defaultCurrency: currency,
        paymentHandles: [],
      });
      // Only touch the phone when it actually changed — resending the same
      // number the account already has is a no-op the server would still
      // process, and an empty field must not clear a number that is set.
      // Comparing in E.164 is what makes that check honest: the same number
      // re-typed with different spacing has to count as unchanged.
      const claimedPhone = composeE164(region, nationalNumber);
      if (claimedPhone.length > 0 && claimedPhone !== meQuery.data?.phone) {
        const result = await authClient.setPhone({ phone: claimedPhone, verificationCode: "" });
        if (result.verificationSent) setVerificationPhone(claimedPhone);
        return;
      }
      await finish();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
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
      await finish();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const confirmMerge = useMutation({
    mutationFn: async () => {
      setError("");
      await authClient.confirmPhoneMerge({ mergeToken });
      setPendingMerge(undefined);
      await finish();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
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

  const skip = useMutation({
    mutationFn: finish,
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return {
    isLoading: meQuery.isLoading,
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
    skip: () => skip.mutate(),
    isPending: save.isPending || verifyPhone.isPending || confirmMerge.isPending || skip.isPending,
  };
}

"use client";
/** First-run flow state: profile fields, the phone and its SMS code, then the payment step. */

import { useState } from "react";
import { onboardingDestination } from "@haalkhata/shared/navigation/onboardingDestination";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { authClient, errorMessage, isRefusal } from "@/lib/api/connect";
import { useVerificationCode } from "@/lib/hooks/useVerificationCode";
import { composeE164, DEFAULT_PHONE_REGION, isValidPhone, splitE164 } from "@haalkhata/shared/phone/phone";
import { INVALID_PHONE_MESSAGE } from "@haalkhata/shared/phone/contact";
import {
  ContactDiscovery,
  isDiscoverable,
  onboardingDiscoveryChange,
} from "@haalkhata/shared/contacts/discovery";

/**
 * Drives the onboarding screen.
 *
 * Phone is deliberately a separate step from the rest of the profile: a new
 * number is written only once an SMS code proves it, so it can stop on the
 * code. The other fields go through the existing UpdateProfile and cannot
 * stop that way.
 *
 * The phone is held as a region plus a national number rather than one string,
 * matching the two controls that edit it; `save` joins them into the E.164 the
 * server stores.
 *
 * The profile step also carries the "let people find me from their
 * contacts" switch, saved with the rest on Continue.
 *
 * The flow has two steps. The profile step (name, phone, currency) ends,
 * however it ends, on the payment step: saved, verified or skipped.
 * Only the payment step leaves onboarding, so everyone is asked once how
 * they want to be paid, and nobody is asked before their currency is known.
 *
 * @returns The step, field values with setters, the code field, actions for
 *   saving / verifying / sending the code again / skipping / finishing, and
 *   the busy flag.
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
  const [verificationPhone, setVerificationPhone] = useState("");
  const codeField = useVerificationCode();
  // Starts on: being findable is the default, and the switch's own words say
  // what it means, so turning it off is one tap on the same screen.
  const [findable, setFindable] = useState(true);
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
    setFindable(isDiscoverable(meQuery.data.contactDiscovery));
    // A number already on the account is stored as E.164; split it so the
    // field opens on the country it was entered with.
    const stored = splitE164(meQuery.data.phone);
    if (stored) {
      setRegion(stored.region);
      setNationalNumber(stored.nationalNumber);
    }
  }

  /**
   * Persists completion, then loads a fresh authenticated document, at
   * whatever this flow interrupted (a bill just joined) or Home. TanStack
   * Query and the App Router maintain separate caches; document navigation
   * reruns the destination's guards against the saved completion state.
   */
  const finish = async () => {
    const completedUser = await authClient.completeOnboarding({});
    queryClient.setQueryData(queryKeys.me, completedUser);
    window.location.replace(onboardingDestination(new URLSearchParams(window.location.search).get("next")));
  };

  const save = useMutation({
    mutationFn: async () => {
      setError("");
      await authClient.updateProfile({ name, defaultCurrency: currency });
      // Wherever the switch was left is the person's answer, saved unless
      // the server already holds it. A yes left on is saved too, so the
      // one-time notice on Friends does not repeat what this screen said.
      const discoveryChange = onboardingDiscoveryChange(
        meQuery.data?.contactDiscovery ?? ContactDiscovery.UNSPECIFIED,
        findable,
      );
      if (discoveryChange !== null) {
        await authClient.setContactDiscovery({ discoverable: discoveryChange });
      }
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
          codeField.markSent();
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
    onSuccess: async () => {
      setVerificationPhone("");
      codeField.clear();
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
    /** Where the "let people find me" switch sits; saved on Continue. */
    findable,
    setFindable,
    error,
    verificationPhone,
    verificationCode: codeField.code,
    /** True once the field holds a whole code. */
    codeComplete: codeField.complete,
    /** The line under the code field. */
    codeHint: codeField.hint,
    /** Seconds before the code can be sent again; 0 when it can be now. */
    resendIn: codeField.resendIn,
    /** Reads a change to the code field; a code that cannot be ours says why. */
    enterVerificationCode: (entered: string) => setError(codeField.enter(entered).notice),
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
      complete.isPending,
  };
}

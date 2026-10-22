"use client";
/** Profile form state: field drafts, validation, the updateProfile mutation, account merge, and sign-out. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { MergePreview } from "@haalkhata/protogen/auth/v1/auth_pb";
import { authClient, errorMessage, isRefusal } from "@/lib/api/connect";
import { useVerificationCode } from "@/lib/hooks/useVerificationCode";
import { socialClient } from "@/lib/api/connect";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import {
  composeE164,
  DEFAULT_PHONE_REGION,
  isValidPhone,
  splitE164,
} from "@haalkhata/shared/phone/phone";
import { INVALID_PHONE_MESSAGE } from "@haalkhata/shared/phone/contact";
import { SAVED_BADGE_MS } from "../constants/profileForm";

/**
 * Profile form state — mounted only once the current user is loaded
 * (initializer, no sync effect).
 *
 * Phone goes through its own RPC rather than riding along on UpdateProfile,
 * because claiming a number can turn up an unclaimed invitation holding it. In
 * that case nothing is written until the user confirms what they would absorb,
 * so `save` can finish in two ways: saved, or waiting on a merge.
 *
 * @param currentUser - The already-loaded signed-in user used to seed the form fields.
 * @returns Form field values (`name`, `currency`, `region`, `nationalNumber`,
 *   `message`) with their setters, a `save` action with its
 *   `isSaving` flag, the `pendingMerge` preview with `confirmMerge` /
 *   `declineMerge`, and a `signOut` action.
 */
export function useProfileForm(currentUser: User) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(currentUser.name);
  const [currency, setCurrency] = useState(currentUser.defaultCurrency || "USD");
  // Confirmation and failure are separate values, not one string: they are
  // shown in different places and must not look alike. A rejected phone
  // rendered in the same muted grey as "Saved ✓" reads as a note about
  // something that worked.
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // The stored number is E.164; split it so the field opens on the country it
  // was entered with rather than defaulting and looking wrong.
  const [region, setRegion] = useState<string>(
    () => splitE164(currentUser.phone)?.region ?? DEFAULT_PHONE_REGION,
  );
  const [nationalNumber, setNationalNumber] = useState(
    () => splitE164(currentUser.phone)?.nationalNumber ?? "",
  );
  const [pendingMerge, setPendingMerge] = useState<MergePreview | undefined>();
  const [mergeToken, setMergeToken] = useState("");
  const [verificationPhone, setVerificationPhone] = useState("");
  const codeField = useVerificationCode();
  // The confirmation clears itself. Setting it in a timer rather than
  // synchronously in the effect body is deliberate — a synchronous setState
  // there is a cascading render, which the lint rule correctly rejects.
  useEffect(() => {
    if (message === "") return;
    const timer = window.setTimeout(() => setMessage(""), SAVED_BADGE_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  const save = useMutation({
    mutationFn: async () => {
      await authClient.updateProfile({ name, defaultCurrency: currency });
      // Only send the phone when it actually changed. Comparing in E.164 is
      // what makes that honest — the same number re-typed with different
      // spacing has to count as unchanged, and re-claiming a number you
      // already hold would otherwise round-trip for nothing.
      const claimedPhone = composeE164(region, nationalNumber);
      if (claimedPhone.length > 0 && claimedPhone !== currentUser.phone) {
        // Checked with the same libphonenumber metadata the server uses, so
        // an impossible number fails beside the field instead of costing an
        // SMS round-trip to hear the same thing.
        if (!isValidPhone(region, nationalNumber)) throw new Error(INVALID_PHONE_MESSAGE);
        const result = await authClient.setPhone({ phone: claimedPhone, verificationCode: "" });
        if (result.verificationSent) {
          codeField.clear();
          setVerificationPhone(claimedPhone);
        }
        return false;
      }
      return true;
    },
    onSuccess: (saved) => {
      // No "Saved ✓" while a merge is waiting — the number is not on the
      // account until it is confirmed, and saying otherwise would be a lie.
      setMessage(saved ? "Saved ✓" : "");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
    // Settled, not success: the profile write lands before the phone claim, so
    // a rejected number still leaves a changed name or currency on the server
    // that the cache would otherwise keep showing stale.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });

  const verifyPhone = useMutation({
    mutationFn: () =>
      authClient.setPhone({ phone: verificationPhone, verificationCode: codeField.code }),
    onSuccess: (result) => {
      setVerificationPhone("");
      codeField.clear();
      if (result.pendingMerge) {
        setPendingMerge(result.pendingMerge);
        setMergeToken(result.mergeToken);
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      setMessage("Saved ✓");
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
    mutationFn: () => authClient.confirmPhoneMerge({ mergeToken }),
    onSuccess: () => {
      setPendingMerge(undefined);
      setMergeToken("");
      // Absorbing an account moves expenses, balances and friendships onto
      // this one, so nothing money-shaped that is already cached is still
      // true. Onboarding gets away without this by navigating away.
      for (const moneyQueryKey of MONEY_KEYS) {
        queryClient.invalidateQueries({ queryKey: moneyQueryKey });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      setMessage("Saved ✓");
    },
    // Stays in the dialog. The row can be claimed by its rightful owner in the
    // seconds between the preview and the answer, and that refusal has to be
    // readable where the user is looking — writing it into the form behind the
    // backdrop is the same as saying nothing.
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const [profileNotice, setProfileNotice] = useState("");
  const [profileShareToken, setProfileShareToken] = useState("");

  // Fetches the link and opens the share dialog; acceptors of the link send
  // a friend request. The dialog owns the QR code, the copy button, and the
  // OS share sheet, so nothing leaves the device on this click alone.
  const shareProfile = useMutation({
    mutationFn: async () => {
      const { token } = await socialClient.getProfileInviteLink({});
      return token;
    },
    onSuccess: (token) => setProfileShareToken(token),
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /** Turns the caller's profile link off; the next share mints a fresh one. */
  const resetProfileLink = useMutation({
    mutationFn: () => socialClient.revokeProfileInviteLink({}),
    onSuccess: () =>
      setProfileNotice("Profile link reset — sharing again makes a new one"),
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const removePhoneMutation = useMutation({
    mutationFn: () => authClient.removePhone({}),
    onSuccess: () => {
      setNationalNumber("");
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      setMessage("Saved ✓");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  // Re-verifies the number already on the account (§35): a number written
  // before verification existed carries no stamp, and `save` deliberately
  // skips an unchanged number. Same SetPhone flow end to end, so the code
  // dialog and the send ceilings behave exactly as for a new number.
  const verifyCurrentPhone = useMutation({
    mutationFn: async () => {
      const result = await authClient.setPhone({
        phone: currentUser.phone,
        verificationCode: "",
      });
      if (result.verificationSent) {
        codeField.clear();
        setVerificationPhone(currentUser.phone);
      }
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /** Backs out of a merge, leaving both accounts untouched and the number unclaimed. */
  const declineMerge = () => {
    setPendingMerge(undefined);
    setMergeToken("");
    // The country was almost certainly right; it is the digits after it that
    // belonged to somebody else.
    setNationalNumber("");
    setMessage("");
    setError("");
  };

  /** Ends the session, clears every cached query, and returns to the login page. */
  const signOut = async () => {
    await authClient.logOut({});
    queryClient.clear();
    router.push("/login");
  };

  return {
    name,
    setName,
    currency,
    setCurrency,
    region,
    setRegion,
    nationalNumber,
    setNationalNumber,
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
    /** True while a code is being checked. */
    isVerifying: verifyPhone.isPending,
    resendCode: () => {
      setError("");
      resendCode.mutate();
    },
    /** True while the code is being sent again. */
    isResending: resendCode.isPending,
    cancelVerification: () => {
      setVerificationPhone("");
      codeField.clear();
      setError("");
    },
    confirmMerge: () => {
      setError("");
      confirmMerge.mutate();
    },
    declineMerge,
    /** Whether a number is on the account, enabling its removal. */
    hasPhone: currentUser.phone !== "",
    /** False on a number written before verification existed (§35). */
    phoneVerified: currentUser.phoneVerified,
    verifyCurrentPhone: () => {
      setMessage("");
      setError("");
      verifyCurrentPhone.mutate();
    },
    isRequestingVerification: verifyCurrentPhone.isPending,
    removePhone: () => {
      setMessage("");
      setError("");
      removePhoneMutation.mutate();
    },
    isRemovingPhone: removePhoneMutation.isPending,
    profileNotice,
    shareProfile: () => {
      setProfileNotice("");
      shareProfile.mutate();
    },
    isSharingProfile: shareProfile.isPending,
    /** Token behind the open share dialog; empty while it is closed. */
    profileShareToken,
    closeProfileShare: () => setProfileShareToken(""),
    resetProfileLink: () => {
      setProfileNotice("");
      resetProfileLink.mutate();
    },
    isResettingProfileLink: resetProfileLink.isPending,
    /** True while the button shows its confirmed state. */
    saved: message !== "",
    message,
    error,
    save: () => {
      setMessage("");
      setError("");
      save.mutate();
    },
    isSaving:
      save.isPending || verifyPhone.isPending || resendCode.isPending || confirmMerge.isPending,
    signOut,
  };
}

"use client";
/** Profile form state: field drafts, validation, the updateProfile mutation, the phone code, and sign-out. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { authClient, errorMessage, isRefusal } from "@/lib/api/connect";
import { useVerificationCode } from "@/lib/hooks/useVerificationCode";
import { socialClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
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
 * because a new number is only written once an SMS code proves it, so `save`
 * can finish in two ways: saved, or waiting on the code.
 *
 * @param currentUser - The already-loaded signed-in user used to seed the form fields.
 * @returns Form field values (`name`, `currency`, `region`, `nationalNumber`,
 *   `message`) with their setters, a `save` action with its `isSaving` flag,
 *   the code dialog's state and actions, and a `signOut` action.
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
          codeField.markSent();
          setVerificationPhone(claimedPhone);
        }
        return false;
      }
      return true;
    },
    onSuccess: (saved) => {
      // No "Saved ✓" while a code is waiting — the number is not on the
      // account until it is verified, and saying otherwise would be a lie.
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
    onSuccess: () => {
      setVerificationPhone("");
      codeField.clear();
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
        codeField.markSent();
        setVerificationPhone(currentUser.phone);
      }
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

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
      save.isPending || verifyPhone.isPending || resendCode.isPending,
    signOut,
  };
}

/** Account data + profile form state: getMe query, updateProfile/setPhone/merge mutations, sign-out. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MergePreview } from "@haalkhata/protogen/auth/v1/auth_pb";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { authClient, errorMessage } from "@/lib/api/connect";
import { socialClient } from "@/lib/api/connect";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { clearMobileQueryCache } from "@/lib/api/queryCache";
import { clearSession, sessionToken } from "@/lib/api/session";
import { rememberUnfinishedSignOut, sessionAlreadyEnded } from "@/lib/api/unfinishedSignOut";
import { composeE164, DEFAULT_PHONE_REGION, isValidPhone, splitE164 } from "@haalkhata/shared/phone/phone";
import { INVALID_PHONE_MESSAGE } from "@haalkhata/shared/phone/contact";
import { SAVED_BADGE_MS, SIGN_OUT_OFFLINE } from "../../../constants/account";
import { forgetThisPhone } from "@/lib/push/pushStore";

/**
 * Fetches the signed-in user via the getMe query.
 *
 * @returns `me` (the current user, or undefined while loading) and `isLoading`.
 */
export function useAccountAPI() {
  const currentUserQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
  });
  // isPending, not isLoading: isLoading stays true for any fetch, so a
  // background refetch after save would swap the whole form for a spinner and
  // remount it — losing every unsaved keystroke. isPending is true only when
  // there is no data at all, which is the one time a spinner is honest.
  return { me: currentUserQuery.data, isLoading: currentUserQuery.isPending, loadError: currentUserQuery.error, retry: currentUserQuery.refetch };
}

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
 *   `isSaving` flag, the phone verification step, the `pendingMerge` preview
 *   with `confirmMerge` / `declineMerge`, and a `signOut` action.
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
  const [verificationCode, setVerificationCode] = useState("");
  // The confirmation clears itself.
  useEffect(() => {
    if (message === "") return;
    const timer = setTimeout(() => setMessage(""), SAVED_BADGE_MS);
    return () => clearTimeout(timer);
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
        if (result.verificationSent) setVerificationPhone(claimedPhone);
        return false;
      }
      return true;
    },
    onSuccess: (saved) => {
      // No "Saved ✓" while a code or a merge is waiting — the number is not
      // on the account until it is confirmed, and saying otherwise would be
      // a lie.
      setMessage(saved ? "Saved ✓" : "");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
    // Settled, not success: the profile write lands before the phone claim, so
    // a rejected number still leaves a changed name or currency on the server
    // that the cache would otherwise keep showing stale.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });

  const verifyPhone = useMutation({
    mutationFn: () => authClient.setPhone({ phone: verificationPhone, verificationCode }),
    onSuccess: (result) => {
      setVerificationPhone("");
      setVerificationCode("");
      if (result.pendingMerge) {
        setPendingMerge(result.pendingMerge);
        setMergeToken(result.mergeToken);
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      setMessage("Saved ✓");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const confirmMerge = useMutation({
    mutationFn: () => authClient.confirmPhoneMerge({ mergeToken }),
    onSuccess: () => {
      setPendingMerge(undefined);
      setMergeToken("");
      // Absorbing an account moves expenses, balances and friendships onto
      // this one, so nothing money-shaped that is already cached is still
      // true.
      for (const moneyQueryKey of MONEY_KEYS) {
        queryClient.invalidateQueries({ queryKey: moneyQueryKey });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      setMessage("Saved ✓");
    },
    // Stays in the sheet. The row can be claimed by its rightful owner in the
    // seconds between the preview and the answer, and that refusal has to be
    // readable where the user is looking.
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const [profileNotice, setProfileNotice] = useState("");

  const [profileShareToken, setProfileShareToken] = useState("");

  // Fetches the link and opens the share sheet dialog; acceptors of the link
  // send a friend request. The dialog owns the QR code, the copy button, and
  // the OS share sheet, so nothing leaves the device on this tap alone.
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
    onSuccess: () => setProfileNotice("Profile link reset — sharing again makes a new one"),
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
      if (result.verificationSent) setVerificationPhone(currentUser.phone);
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

  /**
   * Stops pushes to this phone while the session can still ask, revokes the
   * token server-side, clears the local session and cache, and returns to
   * login. Offline, the phone still signs out, but the server has not heard:
   * the token is kept to end the session the next time the app is online,
   * and the person is told that the account's notifications may arrive
   * until then.
   */
  const signOut = async () => {
    const token = sessionToken();
    await forgetThisPhone();
    let reachedServer = true;
    try {
      await authClient.logOut({});
    } catch (failure) {
      reachedServer = sessionAlreadyEnded(failure);
    }
    if (!reachedServer && token) await rememberUnfinishedSignOut(token).catch(() => undefined);
    await clearSession();
    await clearMobileQueryCache();
    router.replace("/login");
    if (!reachedServer) Alert.alert(SIGN_OUT_OFFLINE.title, SIGN_OUT_OFFLINE.message);
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
    verificationCode,
    setVerificationCode,
    verifyPhone: () => {
      setError("");
      verifyPhone.mutate();
    },
    cancelVerification: () => {
      setVerificationPhone("");
      setVerificationCode("");
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
    isSaving: save.isPending || verifyPhone.isPending || confirmMerge.isPending,
    signOut,
  };
}

"use client";
/** Account data + profile form state: getMe query, updateProfile mutation, sign-out. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { MergePreview } from "@haalkhata/protogen/auth/v1/auth_pb";
import { authClient, errorMessage } from "@/lib/api/connect";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { composeE164, DEFAULT_PHONE_REGION, splitE164 } from "@/lib/phone/phone";

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
  return { me: currentUserQuery.data, isLoading: currentUserQuery.isLoading };
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
 *   `handles`, `message`) with their setters, a `save` action with its
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
  const [handles, setHandles] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      currentUser.paymentHandles.map((entry) => [entry.method, entry.handle]),
    ),
  );

  const save = useMutation({
    mutationFn: async () => {
      await authClient.updateProfile({
        name,
        defaultCurrency: currency,
        paymentHandles: Object.entries(handles).map(([method, handle]) => ({ method, handle })),
      });
      // Only send the phone when it actually changed. Comparing in E.164 is
      // what makes that honest — the same number re-typed with different
      // spacing has to count as unchanged, and re-claiming a number you
      // already hold would otherwise round-trip for nothing.
      const claimedPhone = composeE164(region, nationalNumber);
      if (claimedPhone.length > 0 && claimedPhone !== currentUser.phone) {
        const result = await authClient.setPhone({ phone: claimedPhone });
        if (result.pendingMerge) {
          setPendingMerge(result.pendingMerge);
          setMergeToken(result.mergeToken);
          return false;
        }
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
    confirmMerge: () => {
      setError("");
      confirmMerge.mutate();
    },
    declineMerge,
    handles,
    /**
     * Sets one payment handle in the draft.
     *
     * @param method - Payment method key, e.g. "venmo".
     * @param handle - The handle as typed; blank removes it on save.
     */
    setHandle: (method: string, handle: string) =>
      setHandles((current) => ({ ...current, [method]: handle })),
    message,
    error,
    save: () => {
      setMessage("");
      setError("");
      save.mutate();
    },
    isSaving: save.isPending || confirmMerge.isPending,
    signOut,
  };
}

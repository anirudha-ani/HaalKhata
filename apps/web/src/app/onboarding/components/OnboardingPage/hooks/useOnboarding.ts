"use client";
/** First-run flow state: profile fields, the phone claim, and its merge confirmation. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import type { MergePreview } from "@haalkhata/protogen/auth/v1/auth_pb";
import { authClient, errorMessage } from "@/lib/api/connect";

/**
 * Drives the onboarding screen.
 *
 * Phone is deliberately a separate step from the rest of the profile: claiming
 * a number can turn up an unclaimed invitation holding it, in which case
 * nothing is written until the user confirms what they would absorb. The other
 * fields go through the existing UpdateProfile and cannot fail that way.
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
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [pendingMerge, setPendingMerge] = useState<MergePreview | undefined>();
  const [mergeToken, setMergeToken] = useState("");

  // Seeded from the server exactly once, when the query first resolves. Using
  // state initializers would capture `undefined` on the loading render.
  const [seeded, setSeeded] = useState(false);
  if (meQuery.data && !seeded) {
    setSeeded(true);
    setName(meQuery.data.name);
    setCurrency(meQuery.data.defaultCurrency || "USD");
    setPhone(meQuery.data.phone);
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
      const trimmedPhone = phone.trim();
      if (trimmedPhone.length > 0 && trimmedPhone !== meQuery.data?.phone) {
        const result = await authClient.setPhone({ phone: trimmedPhone });
        if (result.pendingMerge) {
          setPendingMerge(result.pendingMerge);
          setMergeToken(result.mergeToken);
          return;
        }
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
    setPhone("");
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
    phone,
    setPhone,
    error,
    pendingMerge,
    confirmMerge: () => confirmMerge.mutate(),
    declineMerge,
    save: () => save.mutate(),
    skip: () => skip.mutate(),
    isPending: save.isPending || confirmMerge.isPending || skip.isPending,
  };
}

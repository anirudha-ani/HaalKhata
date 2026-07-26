"use client";
/** Account data + profile form state: getMe query, updateProfile mutation, sign-out. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { authClient, errorMessage } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

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
 * @param currentUser - The already-loaded signed-in user used to seed the form fields.
 * @returns Form field values (`name`, `currency`, `message`) with their setters,
 *   a `save` action with its `isSaving` flag, and a `signOut` action.
 */
export function useProfileForm(currentUser: User) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(currentUser.name);
  const [currency, setCurrency] = useState(currentUser.defaultCurrency || "USD");
  const [message, setMessage] = useState("");

  const save = useMutation({
    mutationFn: () => authClient.updateProfile({ name, defaultCurrency: currency }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      setMessage("Saved ✓");
    },
    onError: (mutationError) => setMessage(errorMessage(mutationError)),
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
    message,
    save: () => {
      setMessage("");
      save.mutate();
    },
    isSaving: save.isPending,
    signOut,
  };
}

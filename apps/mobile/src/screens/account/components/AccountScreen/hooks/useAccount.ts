/** Account data + profile form state: getMe query, updateProfile mutation, sign-out. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useRouter } from "expo-router";
import { useState } from "react";
import { authClient, errorMessage } from "@/lib/api/connect";
import { queryKeys } from "@/lib/api/queryKeys";
import { clearSession } from "@/lib/api/session";

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

  /** Revokes the token server-side, clears the local session and cache, and returns to login. */
  const signOut = async () => {
    try {
      await authClient.logOut({});
    } catch {
      // Offline or already revoked — the local session is cleared regardless.
    }
    await clearSession();
    queryClient.clear();
    router.replace("/login");
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

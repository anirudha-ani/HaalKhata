/** Everywhere this account is signed in, and signing any of it out. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { SESSIONS_REFRESH_INTERVAL_MS, sessionsInOrder } from "@haalkhata/shared/auth/sessions";
import { authClient, errorMessage } from "@/lib/api/connect";

/**
 * Reads the list and ends sessions. A failure is said beside the list, and the
 * list is read again either way: it may already have changed elsewhere.
 *
 * @returns The `sessions` in the order to show them, whether they are
 *   `loading`, what reading failed with, and the actions with their state.
 */
export function useSignedInDevices() {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [confirmingOthers, setConfirmingOthers] = useState(false);
  const [clock] = useState(() => Date.now());
  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => authClient.listSessions({}),
    refetchInterval: SESSIONS_REFRESH_INTERVAL_MS,
  });

  /** Reads the list again. */
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions });

  /**
   * Says why something failed, and shows the list as it now stands.
   *
   * @param failure - What was thrown.
   */
  const fail = (failure: unknown) => {
    setError(errorMessage(failure));
    void refresh();
  };

  const endOne = useMutation({
    mutationFn: (sessionId: string) => authClient.endSession({ sessionId }),
    onMutate: () => setError(""),
    onSuccess: refresh,
    onError: fail,
  });
  const endOthers = useMutation({
    mutationFn: () => authClient.endOtherSessions({}),
    onMutate: () => setError(""),
    onSuccess: () => {
      setConfirmingOthers(false);
      return refresh();
    },
    onError: fail,
  });

  const sessions = sessionsInOrder(sessionsQuery.data?.sessions ?? []);
  return {
    sessions,
    clock,
    loading: sessionsQuery.isLoading,
    readError: sessionsQuery.error ? errorMessage(sessionsQuery.error) : "",
    error,
    hasOthers: sessions.some((session) => !session.current),
    confirmingOthers,
    setConfirmingOthers,
    endOne: endOne.mutate,
    endingId: endOne.isPending ? endOne.variables : "",
    endOthers: () => endOthers.mutate(),
    endingOthers: endOthers.isPending,
    retry: refresh,
  };
}

/** What the list and its rows read. */
export type SignedInDevicesController = ReturnType<typeof useSignedInDevices>;

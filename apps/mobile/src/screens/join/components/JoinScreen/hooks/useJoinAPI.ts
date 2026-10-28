/** Invite preview, viewer session and acceptance for the native deep-link screen. */

import { useRouter } from "expo-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Code, ConnectError } from "@connectrpc/connect";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { authClient, socialClient } from "@/lib/api/connect";
import { stashPendingInvite } from "@/lib/invite/pendingInvite";

/** @param token Invite token from the route. @returns Preview, viewer, visible action state, and whether the link expired. */
export function useJoinAPI(token: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: queryKeys.invitePreview(token),
    queryFn: () => socialClient.previewInviteLink({ token }),
    retry: false,
  });
  // Failing just means "not signed in" — a state, not an error.
  const viewer = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
    retry: false,
  });

  const [requestSent, setRequestSent] = useState(false);
  const accept = useMutation({
    mutationFn: () => socialClient.acceptInviteLink({ token }),
    onSuccess: (result) => {
      for (const queryKey of MONEY_KEYS) void queryClient.invalidateQueries({ queryKey });
      // A profile link produces a pending request, not a friendship yet —
      // redirecting to Friends would show nothing and read as a silent fail.
      if (preview.data?.kind === "profile") {
        setRequestSent(true);
        return;
      }
      router.replace(result.groupId ? `/groups/${result.groupId}` : "/friends");
    },
  });

  /** Stashes the token and detours through login; sign-in completes the invite. */
  const signIn = useMutation({
    mutationFn: () => stashPendingInvite(token),
    onSuccess: () => router.replace("/login"),
  });

  // A group link past its date is told apart from one that never worked
  // (FAILED_PRECONDITION, not NOT_FOUND), so the page can say what to do.
  const expired = preview.error instanceof ConnectError && preview.error.code === Code.FailedPrecondition;

  return { preview, viewer, accept, requestSent, signIn, expired };
}

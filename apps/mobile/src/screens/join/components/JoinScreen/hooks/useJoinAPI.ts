/** Invite preview, viewer session and acceptance for the native deep-link screen. */

import { useRouter } from "expo-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Code, ConnectError } from "@connectrpc/connect";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { authClient, socialClient } from "@/lib/api/connect";
import { useSession } from "@/lib/api/session";
import { stashPendingInvite } from "@/lib/invite/pendingInvite";

/** Who is looking at the invite: still being worked out, nobody, somebody, or unknown because asking failed. */
export type JoinViewerStatus = "checking" | "signedOut" | "signedIn" | "failed";

/**
 * @param token Invite token from the route.
 * @returns Preview, viewer and who it is (`viewerStatus`), visible action
 *   state, and whether the link expired.
 */
export function useJoinAPI(token: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const preview = useQuery({
    queryKey: queryKeys.invitePreview(token),
    queryFn: () => socialClient.previewInviteLink({ token }),
    retry: false,
  });
  // A link that starts the app opens this screen before the saved sign-in
  // has been read off the phone. Asked then, the server would hear from
  // nobody and the screen would ask a signed-in person to sign in. So it
  // waits for the saved session, and asks only when there is one: no saved
  // session is "signed out" without asking anybody.
  const hasSession = session.hydrated && session.token !== null;
  const viewer = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
    enabled: hasSession,
    retry: false,
  });
  // A session the server has ended is cleared by the transport, which
  // makes this "signed out"; any other failure leaves who is looking
  // unknown, and the screen says so rather than offering a sign-in.
  const viewerStatus: JoinViewerStatus = !session.hydrated
    ? "checking"
    : !hasSession
      ? "signedOut"
      : viewer.data
        ? "signedIn"
        : viewer.isError
          ? "failed"
          : "checking";

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

  return { preview, viewer, viewerStatus, accept, requestSent, signIn, expired };
}

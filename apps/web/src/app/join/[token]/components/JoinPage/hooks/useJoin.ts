"use client";
/** Invite-link state: the public preview, who is looking at it, and the accept mutation. */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { authClient, socialClient } from "@/lib/api/connect";

/**
 * Loads an invite link's preview and the viewer's session, and accepts the
 * invite on their behalf.
 *
 * The preview needs no session, so the page can name the inviter before
 * anyone signs in; accepting does.
 *
 * @param token - The invite token from the URL.
 * @returns The preview and viewer queries, the accept mutation, and whether
 *   a profile link's friend request has gone out.
 */
export function useJoin(token: string) {
  const router = useRouter();

  const preview = useQuery({
    queryKey: ["invite-preview", token],
    queryFn: () => socialClient.previewInviteLink({ token }),
    retry: false,
  });
  // getMe failing just means "not signed in" — that is a state, not an error.
  const viewer = useQuery({
    queryKey: ["me"],
    queryFn: () => authClient.getMe({}),
    retry: false,
  });

  const [requestSent, setRequestSent] = useState(false);
  const accept = useMutation({
    mutationFn: () => socialClient.acceptInviteLink({ token }),
    onSuccess: (result) => {
      // A profile link produces a pending request, not a friendship yet —
      // redirecting to Friends would show nothing and read as a silent fail.
      if (preview.data?.kind === "profile") {
        setRequestSent(true);
        return;
      }
      router.push(result.groupId ? `/groups/${result.groupId}` : "/friends");
    },
  });

  return { preview, viewer, accept, requestSent };
}

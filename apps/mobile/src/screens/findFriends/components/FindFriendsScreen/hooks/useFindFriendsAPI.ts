/** Find-friends RPCs: the chunked lookup, the batched send, accepting a request and the invite link. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import type { ContactLookupChunk } from "@haalkhata/shared/contacts/identifiers";
import { errorMessage, socialClient } from "@/lib/api/connect";
import { sendInBatches } from "../../../utils/batchedSend";
import { lookUpInChunks } from "../../../utils/chunkedLookup";

/**
 * The screen's server calls, as mutations: none of them is a read worth
 * caching, and a lookup must never re-run on its own (it spends the day's
 * allowance). Callers await them and show failures beside the control.
 *
 * @returns The `lookUp`, `send`, `accept` and `profileLink` mutations.
 */
export function useFindFriendsAPI() {
  const queryClient = useQueryClient();
  /** Refreshes the Friends tab's lists and badge, which these calls change. */
  const refreshFriends = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  };
  const lookUp = useMutation({
    mutationFn: (chunks: ContactLookupChunk[]) =>
      lookUpInChunks(chunks, (chunk) => socialClient.findContacts(chunk), errorMessage),
    retry: false,
  });
  const send = useMutation({
    mutationFn: (userIds: string[]) =>
      sendInBatches(userIds, (batch) => socialClient.sendFriendRequests({ userIds: batch }), errorMessage),
    onSettled: refreshFriends,
  });
  const accept = useMutation({
    mutationFn: (userId: string) => socialClient.respondFriendRequest({ userId, accept: true }),
    onSettled: refreshFriends,
  });
  const profileLink = useMutation({ mutationFn: () => socialClient.getProfileInviteLink({}) });
  return { lookUp, send, accept, profileLink };
}

"use client";
/** The "Friend requests" tab: people waiting on the current user's answer. */

import { Check, Inbox, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import type { FriendsController } from "../../hooks/useFriends";

/**
 * Lists incoming requests with Accept and Decline on each row. The buttons
 * are icon-only on a phone, where two worded buttons left the name a few
 * characters wide; their labels carry the words.
 *
 * @param props - Component props.
 * @returns The request list, or an empty state.
 */
export function IncomingRequests({
  friendsState,
}: {
  /** The friends-page controller from useFriends. */
  friendsState: FriendsController;
}) {
  if (friendsState.incomingRequests.length === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="No friend requests"
        hint="When someone asks to connect, they show up here for you to accept or decline."
      />
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {friendsState.incomingRequests.map((requester) => {
        const responding = friendsState.respondingUserId === requester.id;
        return (
          <li key={requester.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar user={requester} />
            <p className="min-w-0 flex-1 truncate font-medium">{requester.name}</p>
            <button
              type="button"
              disabled={responding}
              onClick={() => friendsState.respondToRequest(requester.id, false)}
              aria-label={`Decline ${requester.name}`}
              title="Decline"
              className="flex items-center gap-1 rounded-lg border border-line p-2 text-sm font-semibold text-ink-soft hover:text-neg-600 disabled:opacity-50 sm:px-3 sm:py-1.5"
            >
              <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Decline</span>
            </button>
            <button
              type="button"
              disabled={responding}
              onClick={() => friendsState.respondToRequest(requester.id, true)}
              aria-label={`Accept ${requester.name}`}
              title="Accept"
              className="flex items-center gap-1 rounded-lg bg-brand-600 p-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:px-3 sm:py-1.5"
            >
              <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Accept</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

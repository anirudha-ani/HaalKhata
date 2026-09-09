"use client";
/** The "Sent requests" tab: what the current user asked for and is still waiting on. */

import { Clock, Send, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import type { FriendsController } from "../../hooks/useFriends";

/**
 * Lists the requests the current user sent, each with a Cancel. A typed email
 * or phone is echoed as typed and never resolved to a name; only someone
 * picked off a screen (or reached through the profile link) shows as a
 * person. Nothing to open yet: there is no ledger until they accept.
 *
 * @param props - Component props.
 * @returns The sent-request list, or an empty state.
 */
export function SentRequests({
  friendsState,
}: {
  /** The friends-page controller from useFriends. */
  friendsState: FriendsController;
}) {
  if (friendsState.outgoingRequests.length === 0) {
    return (
      <EmptyState
        icon={<Send />}
        title="Nothing waiting on anyone"
        hint="Requests you send wait here until the other person accepts them."
      />
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {friendsState.outgoingRequests.map((request) => {
        const rowKey = request.user?.id ?? request.identifier;
        return (
          <li key={rowKey} className="flex items-center gap-3 px-4 py-3">
            {request.user ? (
              <Avatar user={request.user} />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft">
                <Clock className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{request.user?.name ?? request.identifier}</p>
              <p className="text-xs text-ink-soft">Waiting for them to accept</p>
            </div>
            <button
              type="button"
              disabled={friendsState.cancellingKey === rowKey}
              onClick={() => friendsState.cancelSentRequest(request)}
              aria-label={`Cancel the request to ${request.user?.name ?? request.identifier}`}
              title="Cancel request"
              className="flex items-center gap-1 rounded-lg border border-line p-2 text-sm font-semibold text-ink-soft hover:text-neg-600 disabled:opacity-50 sm:px-3 sm:py-1.5"
            >
              <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Cancel</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

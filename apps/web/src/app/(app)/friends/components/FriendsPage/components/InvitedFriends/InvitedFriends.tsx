"use client";
/** The "Invited friends" tab: people added by email or phone who have not joined yet. */

import Link from "next/link";
import { ChevronRight, Mail, Send } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import type { FriendsController } from "../../hooks/useFriends";

/**
 * Lists Invited friends: contacts with no account yet, who can be on no
 * expense until they sign up. Each row opens their (empty) ledger, where the
 * friendship can be removed, and offers the sign-up reminder link, the one
 * useful action for someone who has not joined.
 *
 * @param props - Component props.
 * @returns The invited list, or an empty state.
 */
export function InvitedFriends({
  friendsState,
}: {
  /** The friends-page controller from useFriends. */
  friendsState: FriendsController;
}) {
  if (friendsState.invitedFriends.length === 0) {
    return (
      <EmptyState
        icon={<Mail />}
        title="No invited friends"
        hint="Someone you add who isn't on HaalKhata yet appears here until they join."
      />
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {friendsState.invitedFriends.map((friend) => {
        if (!friend.user) return null;
        const person = friend.user;
        const reminding = friendsState.remindingUserId === person.id;
        return (
          <li key={person.id} className="flex items-center gap-1">
            <Link
              href={`/friends/${person.id}`}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-paper"
            >
              <Avatar user={person} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{person.name}</p>
                <p className="text-xs text-ink-soft">Hasn&apos;t joined yet</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
            </Link>
            <button
              type="button"
              disabled={reminding}
              onClick={() => friendsState.remindFriend(person)}
              className="mr-3 flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {reminding ? "Opening…" : "Remind"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

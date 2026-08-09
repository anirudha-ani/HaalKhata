"use client";
/** Makes any rendering of a person navigate to who they are. */

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Wraps whatever shows a person — avatar, name, both — in a link to their
 * page: the shared ledger for anyone else, your own account page for you.
 *
 * Exists so that a person on screen is never a dead end. The ledger page
 * renders any pair (and carries its own add-friend affordance when there is
 * no friendship yet), so every name can afford to be a door.
 *
 * Not for use inside another link — a feed row that already navigates
 * somewhere cannot nest this.
 *
 * @returns The children, wrapped in the person's link.
 */
export function PersonLink({
  userId,
  meId,
  className = "",
  children,
}: {
  /** The person being shown. */
  userId: string;
  /** The signed-in user's id; matching ids link to the account page. */
  meId: string | undefined;
  /** Extra classes for the link element. */
  className?: string;
  /** Whatever visual represents the person. */
  children: ReactNode;
}) {
  return (
    <Link
      href={userId === meId ? "/account" : `/friends/${userId}`}
      className={`rounded-lg hover:opacity-80 ${className}`}
    >
      {children}
    </Link>
  );
}

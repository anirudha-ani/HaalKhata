"use client";
/** Post-login prompt for a number on the account that never passed SMS verification (§35). */

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";

/**
 * Session-scoped, so the prompt returns on the next sign-in rather than
 * nagging forever within one visit or being dismissible for good — the point
 * is that an unverified number stays claimable by anyone proving possession
 * (§34), which does not stop being true because a banner was closed.
 */
const DISMISS_KEY = "haalkhata-verify-phone-dismissed";

/**
 * Banner shown on every authed page while the account carries an unverified
 * phone number — one written before verification existed. Invisible until
 * mounted: the dismissal lives in sessionStorage, which the server render
 * cannot read, and appearing late beats hydrating wrong.
 *
 * @param props - Component props.
 * @param props.currentUser - The signed-in user, or undefined while loading.
 * @returns The banner, or null when there is nothing to prompt about.
 */
export function VerifyPhoneBanner({ currentUser }: { currentUser: User | undefined }) {
  // useSyncExternalStore rather than an effect: the server snapshot says
  // "dismissed", so SSR and the hydration render agree on rendering nothing,
  // and the real sessionStorage answer arrives in the post-hydration render
  // without a cascading setState.
  const storedDismissed = useSyncExternalStore(
    () => () => {
      // The store never changes underneath us; dismissal is local state below.
    },
    () => {
      try {
        return sessionStorage.getItem(DISMISS_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => true,
  );
  const [dismissedNow, setDismissedNow] = useState(false);

  const dismiss = () => {
    setDismissedNow(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // A blocked store only means the banner returns next page load.
    }
  };

  const dismissed = storedDismissed || dismissedNow;
  if (dismissed || !currentUser || currentUser.phone === "" || currentUser.phoneVerified) {
    return null;
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-neg-600/30 bg-neg-50 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Verify your phone number.</span>{" "}
        {currentUser.phone} was added before verification existed. Confirm it&apos;s yours with a
        quick SMS code so it stays attached to your account.
      </span>
      <Link
        href="/account"
        className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-500"
      >
        Verify now
      </Link>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-lg px-2 py-1.5 font-medium text-ink-soft hover:text-ink"
      >
        Not now
      </button>
    </div>
  );
}

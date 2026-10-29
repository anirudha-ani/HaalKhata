"use client";
/** Renews a Google sign-in nonce before it runs out, while its page is open and in view. */

import { useEffect } from "react";
import {
  FALLBACK_GOOGLE_NONCE_LIFETIME_SECONDS,
  GOOGLE_NONCE_RENEWAL_FRACTION,
} from "@/lib/googleIdentity/googleIdentity.constants";

/** A nonce the page is holding: when it arrived, and how long the server said it lasts. */
export interface HeldNonce {
  /** `Date.now()` when the nonce arrived. */
  receivedAt: number;
  /** Seconds the server accepts it for; 0 when the server did not say. */
  lifetimeSeconds: number;
}

/**
 * Calls `renew` once the held nonce is past {@link GOOGLE_NONCE_RENEWAL_FRACTION}
 * of its life, so the Google button never carries one that has run out —
 * the sign-in page is the home page, and people leave it open.
 *
 * Only while the page is in view: a hidden tab asks for nothing, and one
 * that comes back into view renews at once if its nonce got old meanwhile,
 * before anyone can click. Pass `null` while no nonce is held (one is being
 * fetched); `renew` should set it to `null` first, so it is called once.
 *
 * @param held - The nonce the button carries, or null while there is none.
 * @param renew - Fetches a fresh nonce and arms the button with it.
 */
export function useNonceRenewal(held: HeldNonce | null, renew: () => void): void {
  useEffect(() => {
    if (!held) return;
    const lifetimeSeconds = held.lifetimeSeconds > 0 ? held.lifetimeSeconds : FALLBACK_GOOGLE_NONCE_LIFETIME_SECONDS;
    const renewAt = held.receivedAt + lifetimeSeconds * 1000 * GOOGLE_NONCE_RENEWAL_FRACTION;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Renews now if it is time, or waits until it is, while the page is in view. */
    const schedule = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      const wait = renewAt - Date.now();
      if (wait <= 0) renew();
      else timer = setTimeout(renew, wait);
    };

    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [held, renew]);
}

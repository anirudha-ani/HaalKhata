"use client";
/** Registers the production PWA service worker and removes it in development. */

import { useEffect } from "react";

/**
 * Registers the PWA service worker (`/sw.js`) on production mounts when the
 * browser supports it. Development removes an existing registration because
 * Next's dev asset names are not content-hashed and must never be cache-first.
 * Renders nothing and silently ignores registration failures.
 *
 * @returns Nothing; this component only owns the service-worker side effect.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch(() => {
          // Dev cleanup is best-effort; the app still works without it.
        });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA is progressive enhancement — ignore registration failures.
    });
  }, []);
  return null;
}

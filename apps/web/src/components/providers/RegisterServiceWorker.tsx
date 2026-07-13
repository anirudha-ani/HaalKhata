"use client";
/** Registers the PWA service worker on mount; renders nothing. */

import { useEffect } from "react";

/**
 * Registers the PWA service worker (`/sw.js`) on mount when the browser
 * supports it; renders nothing and silently ignores registration failures.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA is progressive enhancement — ignore registration failures.
      });
    }
  }, []);
  return null;
}

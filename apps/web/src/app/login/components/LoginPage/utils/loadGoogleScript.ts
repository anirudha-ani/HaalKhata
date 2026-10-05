/** Loads the Google Identity Services script once per document. */

import { GOOGLE_SCRIPT_ELEMENT_ID, GOOGLE_SCRIPT_SOURCE } from "@/app/login/constants/googleSignIn";

/**
 * Injects the Google Identity Services script once per document and resolves
 * when it is ready. Re-mounts (React strict mode, route changes) reuse the
 * existing tag rather than loading a second copy, which would re-register the
 * SDK's globals underneath a button already rendered.
 *
 * @returns A promise resolving once `window.google` is available.
 */
export function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google) {
      resolve();
      return;
    }
    const existing = document.getElementById(GOOGLE_SCRIPT_ELEMENT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("load failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ELEMENT_ID;
    script.src = GOOGLE_SCRIPT_SOURCE;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(script);
  });
}

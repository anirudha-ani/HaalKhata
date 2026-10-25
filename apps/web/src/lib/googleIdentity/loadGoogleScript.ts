/** Loads the Google Identity Services script once per document. */

import {
  GOOGLE_SCRIPT_ELEMENT_ID,
  GOOGLE_SCRIPT_FAILED_MESSAGE,
  GOOGLE_SCRIPT_SOURCE,
  GOOGLE_SDK_MISSING_MESSAGE,
  type GoogleIdentityServices,
} from "@/lib/googleIdentity/googleIdentity.constants";

/**
 * Injects the Google Identity Services script once per document and resolves
 * with the SDK once it is ready. Re-mounts (React strict mode, route changes)
 * reuse a tag that is still loading rather than adding a second copy, which
 * would re-register the SDK's globals underneath a button already rendered.
 *
 * A script that loads without defining `window.google` is a failure, not a
 * success with nothing in it: the promise rejects and the tag is removed, so
 * a caller can say why there is no button and a retry loads it afresh. A tag
 * left behind would never fire `load` again and a retry would wait forever.
 *
 * @returns A promise resolving with the SDK.
 * @throws Error with a message fit to show when the script fails to download
 *   or runs without defining the SDK.
 */
export function loadGoogleScript(): Promise<GoogleIdentityServices> {
  return new Promise((resolve, reject) => {
    if (window.google) {
      resolve(window.google);
      return;
    }
    /**
     * Settles once the tag has run: with the SDK it defined, or, when it
     * defined none, with the reason and without the tag.
     *
     * @param script - The tag that fired `load`.
     */
    const settle = (script: HTMLElement) => {
      if (window.google) {
        resolve(window.google);
        return;
      }
      script.remove();
      reject(new Error(GOOGLE_SDK_MISSING_MESSAGE));
    };
    const existing = document.getElementById(GOOGLE_SCRIPT_ELEMENT_ID);
    if (existing) {
      existing.addEventListener("load", () => settle(existing), { once: true });
      existing.addEventListener("error", () => reject(new Error(GOOGLE_SCRIPT_FAILED_MESSAGE)), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ELEMENT_ID;
    script.src = GOOGLE_SCRIPT_SOURCE;
    script.async = true;
    script.onload = () => settle(script);
    script.onerror = () => {
      script.remove();
      reject(new Error(GOOGLE_SCRIPT_FAILED_MESSAGE));
    };
    document.head.appendChild(script);
  });
}

/** Google Identity Services: where its script lives, how its button is drawn, and the slice of its SDK both sign-in pages use. */

/** Google Identity Services client library, loaded on demand by loadGoogleScript. */
export const GOOGLE_SCRIPT_SOURCE = "https://accounts.google.com/gsi/client";

/** Element id used to find the already-injected GIS script tag across mounts. */
export const GOOGLE_SCRIPT_ELEMENT_ID = "google-identity-services";

/** Why sign-in cannot start when the script itself failed to download. */
export const GOOGLE_SCRIPT_FAILED_MESSAGE = "Google's sign-in script did not load";

/**
 * Why sign-in cannot start when the script downloaded and ran but Google's
 * SDK never appeared, which is what a content blocker or a failed bootstrap
 * inside the script looks like from here.
 */
export const GOOGLE_SDK_MISSING_MESSAGE =
  "Google's sign-in script loaded but did not start. A content blocker may be stopping it";

/**
 * How far into its life a sign-in nonce is renewed. Halfway, so a click
 * always carries one with at least half its life left for Google's own
 * steps — with the server's ten minutes, five, enough for a two-step prompt
 * on another device. An earlier nonce stays valid until it expires, so
 * renewing never breaks a sign-in already under way.
 */
export const GOOGLE_NONCE_RENEWAL_FRACTION = 0.5;

/**
 * The lifetime to assume when the server does not say (a deploy from before
 * it did): the five minutes nonces used to last.
 */
export const FALLBACK_GOOGLE_NONCE_LIFETIME_SECONDS = 300;

/** Rendering options for Google's own button, which it draws into our div. */
export const GOOGLE_BUTTON_OPTIONS = {
  theme: "outline",
  size: "large",
  shape: "pill",
  text: "continue_with",
  logo_alignment: "center",
  width: 320,
} as const;

/** The single field we read off Google's credential callback. */
export interface GoogleCredentialResponse {
  /** The ID token (a JWT) to hand to the server for verification. */
  credential: string;
}

/**
 * The slice of the Google Identity Services SDK this app uses, on the app's
 * sign-in page and the admin page alike. Declared here rather than pulled in
 * as a types package because three calls is the whole surface area we touch.
 */
export interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        nonce: string;
        callback: (response: GoogleCredentialResponse) => void;
      }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

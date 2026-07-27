/** Google Identity Services constants and the minimal shape we use of its SDK. */

/** Google Identity Services client library; loaded on demand by useGoogleSignIn. */
export const GOOGLE_SCRIPT_SOURCE = "https://accounts.google.com/gsi/client";

/** Element id used to find the already-injected GIS script tag across mounts. */
export const GOOGLE_SCRIPT_ELEMENT_ID = "google-identity-services";

/** OAuth client id the browser renders the button for; set at build time. */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

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
 * The slice of the Google Identity Services SDK this app uses. Declared here
 * rather than pulled in as a types package because three calls is the whole
 * surface area we touch.
 */
export interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
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

/** The app sign-in page's configuration: which Google client it renders for and whether the password form is offered. */

/** OAuth client id the browser renders the button for; set at build time. */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/**
 * Whether to offer the email/phone + password form. Google and Apple handle
 * production sign-in; the password form stays in development so seeded accounts
 * remain reachable.
 *
 * Mirrors `passwordAuthEnabled()` in the server's auth.constants — kept
 * separate because that module reaches for node:path and cannot be pulled into
 * a client bundle. The server is the enforcing side; this only decides whether
 * a control that would be rejected anyway is worth rendering.
 */
export const PASSWORD_AUTH_ENABLED = process.env.NODE_ENV !== "production";

/** Browser security policy builders shared by middleware and regression tests. */

/** CSP directives shared by production and development. */
const BASE_CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "connect-src 'self' https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
];

/**
 * Builds a nonce-based application CSP. Modern browsers use `strict-dynamic`
 * to trust scripts loaded by nonce-bearing Next.js bundles; the explicit
 * Google and same-origin sources preserve compatibility with older browsers.
 *
 * @param environment - Node environment used to select dev-only allowances.
 * @param nonce - Cryptographically random nonce generated for this request.
 * @returns A semicolon-separated Content-Security-Policy value.
 */
export function contentSecurityPolicy(
  environment: string | undefined,
  nonce: string,
): string {
  const scriptSources = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    environment === "development" ? "'unsafe-eval'" : "",
    "https://accounts.google.com/gsi/client",
  ]
    .filter(Boolean)
    .join(" ");
  const directives = [...BASE_CSP_DIRECTIVES, scriptSources, "script-src-attr 'none'"];
  if (environment === "production") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

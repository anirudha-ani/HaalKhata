/** Post-login destination from the ?next= query, guarded against open redirects. */

/** Relative in-app paths only: one leading slash, then safe path characters. */
const SAFE_NEXT_PATTERN = /^\/(?!\/)[A-Za-z0-9_\-/]*$/;

/**
 * Where login should land when it succeeds: the validated `next` query
 * parameter, or the dashboard. Read from the live URL at submit time rather
 * than through useSearchParams, which would drag a Suspense boundary into a
 * page that needs nothing else from it.
 *
 * @returns A safe relative path.
 */
export function nextPathFromLocation(): string {
  if (typeof window === "undefined") return "/dashboard";
  const requested = new URLSearchParams(window.location.search).get("next");
  return requested && SAFE_NEXT_PATTERN.test(requested) ? requested : "/dashboard";
}

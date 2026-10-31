/** Where somebody lands when first-run setup ends, on both apps. */

import { safeActivityPath } from "./activityPath";

/** Where setup ends when nothing better was asked for. */
const DEFAULT_DESTINATION = "/dashboard";

/** The edit form of one bill, with its invite open or not: the one destination that has a query. */
const EDIT_FORM_DESTINATION = /^\/expenses\/new\?edit=[A-Za-z0-9_-]{1,128}(&invite=1)?$/;

/**
 * Where to go once setup ends: the screen the person was headed for when it
 * interrupted them (a group or bill they just joined), if it is one the app may
 * open, or Home. The form of a bill is the one place that needs a query, and
 * only that exact shape is let through.
 *
 * @param candidate - The `next` parameter setup was opened with; untrusted.
 * @returns A safe in-app path.
 */
export function onboardingDestination(candidate: unknown): string {
  if (typeof candidate !== "string" || candidate === "") return DEFAULT_DESTINATION;
  if (EDIT_FORM_DESTINATION.test(candidate)) return candidate;
  return safeActivityPath(candidate) === candidate ? candidate : DEFAULT_DESTINATION;
}

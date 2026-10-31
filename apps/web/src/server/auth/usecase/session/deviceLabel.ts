/**
 * What to call a device in a person's list of sign-ins. Only that name is
 * kept, never the description a browser sent, which says far more than anybody
 * needs in order to recognise their own laptop.
 */

import {
  BROWSER_MARKERS,
  MAX_SESSION_DEVICE_LENGTH,
  MAX_USER_AGENT_READ_LENGTH,
  SYSTEM_MARKERS,
  UNNAMED_BROWSER_DEVICE,
} from "@/server/auth/auth.constants";
import { UNNAMED_APP_DEVICE } from "@haalkhata/shared/auth/sessions";

/** A device, as a sign-in stores it. */
export interface DeviceDescription {
  /** "Chrome on Mac", "iPhone 15 Pro". */
  label: string;
  /** Whether it is the phone app rather than a browser. */
  isApp: boolean;
}

/** For a sign-in with nothing to go on. */
export const UNKNOWN_DEVICE: DeviceDescription = { label: UNNAMED_BROWSER_DEVICE, isApp: false };

/**
 * Finds the first marker a description contains. Plain substring checks, so a
 * hostile description costs nothing however it is built.
 *
 * @param description - The description.
 * @param markers - Marker and name pairs, most specific first.
 * @returns The name, or "" when none matches.
 */
function firstMatch(description: string, markers: readonly (readonly [marker: string, name: string])[]): string {
  return markers.find(([marker]) => description.includes(marker))?.[1] ?? "";
}

/**
 * Names a browser from its User-Agent header.
 *
 * @param userAgent - The header, or null when there was none.
 * @returns "Chrome on Mac", as much of that as it can tell, or a plain fallback.
 */
export function browserLabel(userAgent: string | null): string {
  const description = (userAgent ?? "").slice(0, MAX_USER_AGENT_READ_LENGTH);
  const browser = firstMatch(description, BROWSER_MARKERS);
  const system = firstMatch(description, SYSTEM_MARKERS);
  if (browser && system) return `${browser} on ${system}`;
  return browser || system || UNNAMED_BROWSER_DEVICE;
}

/**
 * Tidies the name a phone gave itself. It comes from the client, and ends up
 * on the person's own screen, so it is measured before it is cleaned.
 *
 * @param name - The phone's model name, or null when it sent none.
 * @returns The name to store.
 */
export function appLabel(name: string | null): string {
  const cleaned = (name ?? "")
    .slice(0, MAX_SESSION_DEVICE_LENGTH)
    .replace(/[^\p{L}\p{N} .,()'+-]/gu, "")
    .trim();
  return cleaned || UNNAMED_APP_DEVICE;
}

/** Account-route constants. */

/**
 * How long the save button holds its confirmed state before returning to
 * "Save changes", in milliseconds. Long enough to read, short enough that a
 * second save is never waiting on it.
 */
export const SAVED_BADGE_MS = 1800;

/** The two things a bank will accept as a Zelle identity. */
export const ZELLE_MODES = [
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
] as const;

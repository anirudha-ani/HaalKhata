/** Reads the device's contacts permission into the states the screen shows. */

/**
 * Where the screen stands with contacts access:
 * - `undetermined`: never asked; the explanation comes before the OS prompt.
 * - `denied`: refused, but the OS will ask again.
 * - `blocked`: refused for good; only Settings can change it.
 * - `all` / `limited`: readable; `limited` is iOS 18's "selected contacts only".
 */
export type ContactsAccess = "undetermined" | "denied" | "blocked" | "all" | "limited";

/** The fields of expo's permission response this screen reads. */
export interface ContactsPermissionState {
  /** "granted", "denied" or "undetermined". */
  status: string;
  /** Whether asking again would show the OS prompt. */
  canAskAgain: boolean;
  /** iOS 18+: whether access covers all contacts or only chosen ones. */
  accessPrivileges?: "all" | "limited" | "none";
}

/**
 * Maps a permission response onto the screen's states. Android reports no
 * `accessPrivileges`, so a grant there means every contact.
 *
 * @param permission - The response from getPermissionsAsync or requestPermissionsAsync.
 * @returns The state to show.
 */
export function contactsAccessOf(permission: ContactsPermissionState): ContactsAccess {
  if (permission.status === "granted") {
    return permission.accessPrivileges === "limited" ? "limited" : "all";
  }
  if (permission.status === "undetermined") return "undetermined";
  return permission.canAskAgain ? "denied" : "blocked";
}

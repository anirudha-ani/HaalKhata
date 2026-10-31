/** Recognizes the server's answer for an email or phone that belongs to nobody on HaalKhata. */

import { Code, ConnectError } from "@connectrpc/connect";

/**
 * Whether an add (AddFriend, AddMembers) was refused because the typed email
 * or phone belongs to nobody on HaalKhata. Both refuse that with
 * FailedPrecondition, and the add forms answer it with an invite link to
 * share rather than an error: nothing is created for that person, who signs
 * up through the link as themselves.
 *
 * @param error - The unknown value caught from the failed RPC.
 * @param contact - The email and phone as sent; an add by picked people alone never gets the offer.
 * @returns True when the form should offer the invite link.
 */
export function isNotOnHaalKhata(error: unknown, contact: { email: string; phone: string }): boolean {
  return (
    error instanceof ConnectError &&
    error.code === Code.FailedPrecondition &&
    (contact.email !== "" || contact.phone !== "")
  );
}

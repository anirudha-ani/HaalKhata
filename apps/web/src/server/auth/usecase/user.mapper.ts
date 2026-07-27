/** UserRow → common.v1.User init shape. */

import type { UserRow } from "@/server/auth/repo/users.repo";

/**
 * Maps a users table row to the common.v1.User message init shape.
 *
 * @param userRow - Database row to convert.
 * @returns Plain object matching the proto User fields; registered reflects
 *   whether the account has been claimed by either credential (false for
 *   shadow users); phone is the E.164 string or empty when unset; email is
 *   empty for phone-only accounts.
 */
export function toUser(userRow: UserRow) {
  return {
    id: userRow.id,
    email: userRow.email ?? "",
    name: userRow.name,
    avatarColor: userRow.avatar_color,
    defaultCurrency: userRow.default_currency,
    // A Google account has no password, so password_hash alone would read
    // every one of them as an unclaimed invite.
    registered: userRow.password_hash !== null || userRow.google_sub !== null,
    phone: userRow.phone ?? "",
    // Absent on a row straight out of an INSERT ... RETURNING *, which has no
    // handles yet by definition.
    paymentHandles: userRow.payment_handles ?? [],
    onboarded: userRow.onboarded_at !== null,
  };
}

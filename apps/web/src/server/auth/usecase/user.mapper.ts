/** UserRow → common.v1.User init shape. */

import type { UserRow } from "@/server/auth/repo/users.repo";

/**
 * Maps a users table row to the common.v1.User message init shape.
 *
 * @param userRow - Database row to convert.
 * @returns Plain object matching the proto User fields; registered reflects
 *   whether a password has been set (false for shadow users); phone is the
 *   E.164 string or empty when unset; email is empty for phone-only accounts.
 */
export function toUser(userRow: UserRow) {
  return {
    id: userRow.id,
    email: userRow.email ?? "",
    name: userRow.name,
    avatarColor: userRow.avatar_color,
    defaultCurrency: userRow.default_currency,
    registered: userRow.password_hash !== null,
    phone: userRow.phone ?? "",
  };
}

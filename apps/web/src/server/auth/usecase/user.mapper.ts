/** Privacy-aware UserRow → common.v1.User init shapes. */

import type { UserRow } from "@/server/auth/repo/users.repo";

/**
 * Maps a users table row to the public common.v1.User shape used when another
 * account is the viewer. Email, phone, and onboarding state are private;
 * payment handles remain visible because expense counterparties need them to
 * settle outside the app.
 *
 * @param userRow - Database row to convert.
 * @returns Public proto User fields with private contact/state fields cleared.
 */
export function toPublicUser(userRow: UserRow) {
  return {
    id: userRow.id,
    email: "",
    name: userRow.name,
    avatarColor: userRow.avatar_color,
    avatarUrl: userRow.avatar_url ?? "",
    defaultCurrency: userRow.default_currency,
    // A Google account has no password, so password_hash alone would read
    // every one of them as an unclaimed invite.
    registered: userRow.password_hash !== null || userRow.google_sub !== null,
    phone: "",
    // Absent on a row straight out of an INSERT ... RETURNING *, which has no
    // handles yet by definition.
    paymentHandles: userRow.payment_handles ?? [],
    onboarded: false,
  };
}

/**
 * Maps a friend-request sender without exposing contact, payment, currency,
 * registration, or onboarding details before the recipient accepts.
 *
 * @param userRow - Requesting account shown to the request recipient.
 * @returns Minimal identity fields needed to decide whether to accept.
 */
export function toFriendRequestUser(userRow: UserRow) {
  return {
    id: userRow.id,
    email: "",
    name: userRow.name,
    avatarColor: userRow.avatar_color,
    avatarUrl: userRow.avatar_url ?? "",
    defaultCurrency: "",
    registered: false,
    phone: "",
    paymentHandles: [],
    onboarded: false,
  };
}

/**
 * Maps a users table row to the caller's own common.v1.User shape, restoring
 * fields deliberately cleared by {@link toPublicUser}.
 *
 * @param userRow - Authenticated caller's database row.
 * @returns Full self-profile proto User fields including contact and onboarding state.
 */
export function toPrivateUser(userRow: UserRow) {
  return {
    ...toPublicUser(userRow),
    email: userRow.email ?? "",
    phone: userRow.phone ?? "",
    onboarded: userRow.onboarded_at !== null,
  };
}

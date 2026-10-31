/** Privacy-aware UserRow → common.v1.User init shapes. */

import { ContactDiscovery } from "@haalkhata/protogen/common/v1/common_pb";
import type { UserRow } from "@/server/auth/repo/users.repo";

/**
 * Whether a row is somebody who can sign in. False only for the Deleted
 * member a deleted account leaves in shared history: chk_users_can_sign_in
 * refuses any other row without a credential.
 * @param user Account identity columns.
 * @returns True for a password, Google, or Apple account.
 */
export function isRegisteredUser(user: Pick<UserRow, "password_hash" | "google_sub" | "apple_sub">): boolean {
  return user.password_hash !== null || user.google_sub !== null || Boolean(user.apple_sub);
}

/**
 * Maps a users table row to the public common.v1.User shape used when another
 * account is the viewer. Email, phone, and onboarding state are private.
 * How a person wants to be paid is not on a user at all any more: it reaches
 * someone who owes them through the friend ledger, and nobody else.
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
    registered: isRegisteredUser(userRow),
    deleted: Boolean(userRow.deleted_at),
    phone: "",
    // Retired field, declared for older clients and always empty.
    paymentHandles: [],
    onboarded: false,
  };
}

/**
 * Maps a friend-request sender without exposing contact, currency,
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
    phoneVerified: userRow.phone_verified_at !== null,
    onboarded: userRow.onboarded_at !== null,
    contactDiscovery: toContactDiscovery(userRow.contact_discovery),
  };
}

/**
 * Maps the stored three-state answer onto the wire enum.
 *
 * @param stored - users.contact_discovery: null (never answered, findable by default), true or false.
 * @returns ON, OFF, or UNSPECIFIED for never asked.
 */
export function toContactDiscovery(stored: boolean | null | undefined): ContactDiscovery {
  if (stored === true) return ContactDiscovery.ON;
  if (stored === false) return ContactDiscovery.OFF;
  return ContactDiscovery.UNSPECIFIED;
}

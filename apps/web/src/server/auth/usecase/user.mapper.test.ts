/** Privacy regressions for self-profile and public user projections. */

import { describe, expect, it } from "vitest";
import type { UserRow } from "@/server/auth/repo/users.repo";
import { toFriendRequestUser, toPrivateUser, toPublicUser } from "./user.mapper";

/** Fully populated row that makes accidental private-field disclosure visible. */
const USER_ROW: UserRow = {
  id: "user-123",
  email: "private@example.com",
  name: "Private Person",
  avatar_color: "#c73e2e",
  avatar_url: "https://lh3.googleusercontent.com/avatar",
  default_currency: "USD",
  password_hash: null,
  phone: "+14155552671",
  google_sub: "google-private",
  onboarded_at: "2026-08-28T00:00:00Z",
  phone_verified_at: "2026-09-01T00:00:00Z",
  merged_into: null,
  token_version: 3,
  created_at: "2026-08-01T00:00:00Z",
  payment_handles: [{ method: "venmo", handle: "private-person" }],
};

describe("user response projections", () => {
  it("clears private contact and state fields from public users", () => {
    const publicUser = toPublicUser(USER_ROW);

    expect(publicUser.email).toBe("");
    expect(publicUser.phone).toBe("");
    expect(publicUser.onboarded).toBe(false);
    expect("phoneVerified" in publicUser).toBe(false);
    expect(publicUser.paymentHandles).toEqual(USER_ROW.payment_handles);
    expect(publicUser.name).toBe(USER_ROW.name);
  });

  it("retains private fields for the authenticated caller's profile", () => {
    const privateUser = toPrivateUser(USER_ROW);

    expect(privateUser.email).toBe(USER_ROW.email);
    expect(privateUser.phone).toBe(USER_ROW.phone);
    expect(privateUser.phoneVerified).toBe(true);
    expect(privateUser.onboarded).toBe(true);
  });

  it("shows only identity fields on an incoming friend request", () => {
    const requestUser = toFriendRequestUser(USER_ROW);

    expect(requestUser).toMatchObject({
      id: USER_ROW.id,
      name: USER_ROW.name,
      avatarColor: USER_ROW.avatar_color,
      avatarUrl: USER_ROW.avatar_url,
    });
    expect(requestUser.email).toBe("");
    expect(requestUser.phone).toBe("");
    expect(requestUser.defaultCurrency).toBe("");
    expect(requestUser.paymentHandles).toEqual([]);
  });
});

/** Which push switch governs each kind of in-app notification; read by the server dispatcher and both settings screens. */

/** The switches a person can turn off, in the order the settings screens list them. */
export const PUSH_CATEGORIES = ["expenses", "comments", "payments", "groups", "friends"] as const;

/** One switchable push category. */
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

/** A category, or "always" for alerts that have no switch (a verified number moving accounts). */
export type PushRoute = PushCategory | "always";

/**
 * Every notification kind the server writes today, mirroring the database's
 * chk_notifications_type minus the legacy 'other' bucket, which nothing
 * writes any more.
 */
export const NOTIFICATION_KINDS = [
  "expense_added",
  "expense_updated",
  "expense_deleted",
  "comment",
  "settlement",
  "settlement_deleted",
  "reminder",
  "added_to_group",
  "member_added",
  "ownership_transferred",
  "simplify_debts",
  "friend_request",
  "invite_accepted",
  "phone_transferred",
] as const;

/** One notification kind the server writes. */
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** The switch (or "always") behind each notification kind. */
const ROUTE_BY_KIND: Record<NotificationKind, PushRoute> = {
  expense_added: "expenses",
  expense_updated: "expenses",
  expense_deleted: "expenses",
  comment: "comments",
  settlement: "payments",
  settlement_deleted: "payments",
  reminder: "payments",
  added_to_group: "groups",
  member_added: "groups",
  ownership_transferred: "groups",
  simplify_debts: "groups",
  friend_request: "friends",
  invite_accepted: "friends",
  phone_transferred: "always",
};

/**
 * Finds the switch that decides whether a notification kind is pushed.
 *
 * @param kind - The notification's type column, as stored.
 * @returns Its category, "always" for an alert with no switch, or undefined
 *   for a kind this build does not know — which callers must not push, so an
 *   unexpected kind fails closed instead of bypassing every switch.
 */
export function pushRouteOf(kind: string): PushRoute | undefined {
  return (NOTIFICATION_KINDS as readonly string[]).includes(kind)
    ? ROUTE_BY_KIND[kind as NotificationKind]
    : undefined;
}

/** A person's choice per category, as PushService returns it. */
export type PushPreferenceValues = Record<PushCategory, boolean>;

/** What an account that never chose receives: everything. */
export const DEFAULT_PUSH_PREFERENCES: PushPreferenceValues = {
  expenses: true,
  comments: true,
  payments: true,
  groups: true,
  friends: true,
};

/**
 * Decides whether a notification kind may be pushed under a person's choices.
 *
 * @param kind - The notification's type column.
 * @param preferences - The person's switches.
 * @returns True when the kind is known and either always sent or switched on.
 */
export function shouldPushKind(kind: string, preferences: PushPreferenceValues): boolean {
  const route = pushRouteOf(kind);
  if (route === undefined) return false;
  return route === "always" || preferences[route];
}

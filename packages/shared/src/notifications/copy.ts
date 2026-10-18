/** Push notification wording shared by the server, the browser and the native app. */

import type { PushCategory, PushRoute } from "./categories";

/** The Account card, the first-use explainer and the test push. */
export const PUSH_COPY = {
  settingTitle: "Notifications",
  settingHint: "Choose what reaches your phones. Activity always keeps everything.",
  explainerTitle: "Know when friends add expenses or pay you",
  explainerBody:
    "HaalKhata can notify you when someone adds or changes an expense with you, records a payment, comments, or changes a group you're in. You choose which in Account.",
  explainerContinue: "Continue",
  thisPhone: "This phone",
  statusOn: "Notifications are on for this phone.",
  statusNotAsked: "Notifications aren't on for this phone yet.",
  statusDenied: "Notifications are off for HaalKhata in iOS Settings.",
  statusUnsupported: "This device can't receive notifications.",
  turnOn: "Turn on",
  openSettings: "Open Settings",
  registering: "Connecting this phone…",
  registerFailed: "This phone couldn't be connected for notifications.",
  retry: "Retry",
  notNow: "Not now",
  categoriesTitle: "What to send",
  phonesTitle: "Your phones",
  noPhones: "No phone gets notifications yet. Turn them on in the HaalKhata app on your phone.",
  sendTest: "Send a test",
  testSent: "Sent. It should arrive in a few seconds.",
  remove: "Remove",
  removed: "Removed. That phone gets no more notifications until they're turned on there again.",
  offline: "You are offline. Reconnect to change notification settings.",
  lastSent: "Last notification",
  lastSeen: "Last opened",
  never: "none yet",
  testTitle: "HaalKhata",
  testBody: "Test notification: notifications reach this phone.",
} as const;

/** Label and one-line description for each switch. */
export const PUSH_CATEGORY_COPY: Record<PushCategory, { label: string; hint: string }> = {
  expenses: { label: "Expenses", hint: "Added, edited or deleted by someone else" },
  comments: { label: "Comments", hint: "On expenses you're part of" },
  payments: { label: "Payments and reminders", hint: "Recorded, removed, or a nudge to pay" },
  groups: { label: "Groups", hint: "Added to a group, new members, a new owner, simplified debts" },
  friends: { label: "Friends", hint: "Friend requests and accepted invites" },
};

/**
 * What a phone shows in place of a push when its owner hides previews; one
 * per route, registered by the app as notification categories.
 */
export const PUSH_PREVIEW_PLACEHOLDER: Record<PushRoute, string> = {
  expenses: "Expense update",
  comments: "New comment",
  payments: "Payment update",
  groups: "Group update",
  friends: "Friend update",
  always: "Account alert",
};

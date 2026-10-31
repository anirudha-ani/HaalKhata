/**
 * Words for the iPhone and iPad first-run flow. Contacts and notification
 * wording comes from the shared packages the rest of the app uses; this
 * holds what only this flow says.
 */

import { VERIFICATION_CODE_RESENT } from "@haalkhata/shared/phone/phone.constants";

/** The profile step. */
export const PROFILE_STEP = {
  welcomeNamed: (firstName: string) => `Welcome, ${firstName}`,
  welcome: "Welcome to HaalKhata",
  body: "This is how friends see you on shared expenses. Check your name and the currency you usually spend in.",
  nameLabel: "Your name",
  currencyLabel: "Default currency",
  currencyHint: "New expenses start in this currency. You can pick another on any expense.",
  next: "Continue",
  skip: "Skip for now",
} as const;

/** The phone step, before a code is sent. */
export const PHONE_STEP = {
  title: "Add your phone number",
  body: "Your number connects you to the people who already have it.",
  benefits: [
    "Friends who have your number can find you here",
    "Expenses friends added for this number come to you",
    "Never used to sign in, never shown to anyone",
  ],
  verifiedTitle: "Your phone is verified",
  verifiedBody: "Friends who have this number can find you, unless you turn that off below.",
  sendCode: "Send code",
  next: "Continue",
  skip: "Skip for now",
} as const;

/** The phone step, while a code is being entered. */
export const CODE_STEP = {
  title: "Enter the code",
  body: (phone: string) => `We texted a code to ${phone}. It arrives in a few seconds.`,
  verify: "Verify",
  resend: "Resend code",
  resendIn: (seconds: number) => `Resend code in ${seconds}s`,
  // Inside its ten minutes Twilio texts the same code again, so this does
  // not promise a new one.
  resent: VERIFICATION_CODE_RESENT,
  changeNumber: "Use a different number",
  inputLabel: "Verification code",
} as const;

/** The payment step. */
export const PAYMENT_STEP = {
  title: "How do you want to be paid?",
  body: "Add it now so nobody has to ask where to send money. Only people who owe you ever see it.",
  next: "Continue",
  skip: "Skip for now",
  later: "You can add or change these any time in Account.",
} as const;

/** The find-friends step, around the shared contacts wording. */
export const FRIENDS_STEP = {
  benefits: ["See who's already on HaalKhata", "Add them in a tap", "Names stay on this phone"],
  next: "Continue",
  foundTitle: (count: number) =>
    count === 1 ? "1 of your contacts is on HaalKhata" : `${count} of your contacts are on HaalKhata`,
  foundBody: "Add the people you split with. They get a friend request from you.",
  retryAccess: "Try again",
  continueWithout: "Continue without contacts",
} as const;

/** The notifications step, around the shared push wording. */
export const NOTIFICATIONS_STEP = {
  next: "Continue",
  retry: "Try again",
  skipAfterError: "Not now",
  previewApp: "HAALKHATA",
  previewNow: "now",
  previews: [
    { title: "Oni added “Dinner at Nando's”", body: "$96.00 · you owe Oni $24.00" },
    { title: "Dot paid you $40.00", body: "Trip to Yosemite · you're all square" },
  ],
} as const;

/** The closing step. */
export const DONE_STEP = {
  titleNamed: (firstName: string) => `You're all set, ${firstName}`,
  title: "You're all set",
  body: "Add an expense, scan a receipt, or settle up. Everyone on it sees the change straight away.",
  start: "Start using HaalKhata",
  phoneVerified: "Phone number verified",
  requestsSent: (count: number) => (count === 1 ? "1 friend request sent" : `${count} friend requests sent`),
  friendsAdded: (count: number) => (count === 1 ? "1 friend added" : `${count} friends added`),
  notificationsOn: "Notifications on for this phone",
  paymentAdded: "Payment details added",
  tips: ["Tap + on Home to add an expense", "Scan a receipt to split it item by item"],
} as const;

/** The step indicator's spoken label. */
export function stepLabel(position: number, total: number): string {
  return `Step ${position} of ${total}`;
}

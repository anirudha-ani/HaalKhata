/**
 * Which steps of the first-run flow a person sees, decided once when the flow
 * opens from what the account and this phone already have.
 *
 * Two kinds of step. Account steps (profile, phone, payment) run until the
 * server stamps onboarding complete, wherever the person signs up. Device
 * steps (find friends, notifications) belong to this phone: permissions are
 * per install, so someone who set up their account on the web still gets
 * them the first time they sign in here. A step whose question was already
 * answered on this phone is left out rather than shown with nothing to do.
 */

import { safeActivityPath } from "@haalkhata/shared/navigation/activityPath";
import type { ContactsAccess } from "@/lib/contacts/contactsAccess";
import type { PushPermission } from "@/lib/push/push";
import { DEFAULT_DESTINATION } from "./onboarding.constants";

/** One screen of the flow. */
export type OnboardingStepId = "profile" | "phone" | "payment" | "friends" | "notifications" | "done";

/** Steps that are the account's, ending when the server marks onboarding complete. */
export const ACCOUNT_STEPS: readonly OnboardingStepId[] = ["profile", "phone", "payment"];

/** What the flow is planned from. */
export interface OnboardingSituation {
  /** The server has not marked onboarding complete. */
  accountSetup: boolean;
  /** This phone still owes the person the device steps (they signed in here). */
  deviceSetupOwed: boolean;
  /** The account's number passed SMS verification. */
  phoneVerified: boolean;
  /** Contacts access on this phone; undefined when it could not be read. */
  contactsAccess: ContactsAccess | undefined;
  /** Notification permission on this phone. */
  pushPermission: PushPermission | "unknown";
}

/**
 * Plans the flow.
 *
 * - Account setup shows profile, phone (even when verified, since it carries
 *   the "let people find me" switch) and payment, then the device steps.
 * - A person whose account is set up gets the device steps only after
 *   signing in on this phone, and the phone step only if their number is
 *   unverified.
 * - Find friends is shown unless contacts were already refused on this
 *   phone (iOS shows its prompt once; Settings is the only way back, and
 *   Friends links there). Notifications only while iOS has not asked yet.
 * - A closing "all set" screen follows anything shown.
 *
 * @param situation - The account and phone as they are now.
 * @returns The steps in order; empty when there is nothing to show.
 */
export function planOnboardingSteps(situation: OnboardingSituation): OnboardingStepId[] {
  const steps: OnboardingStepId[] = [];
  if (situation.accountSetup) {
    steps.push(...ACCOUNT_STEPS);
  } else if (!situation.deviceSetupOwed) {
    return [];
  } else if (!situation.phoneVerified) {
    steps.push("phone");
  }
  const access = situation.contactsAccess;
  if (access === "undetermined" || access === "all" || access === "limited") steps.push("friends");
  if (situation.pushPermission === "undetermined") steps.push("notifications");
  if (steps.length > 0) steps.push("done");
  return steps;
}

/**
 * Where to go once the flow ends: the screen the person was headed for when
 * the flow interrupted them (a group from an invitation, say), if it is one
 * the app may open, or Home.
 *
 * @param candidate - The `next` parameter the flow was opened with; untrusted.
 * @returns A safe in-app path.
 */
export function onboardingDestination(candidate: unknown): string {
  if (typeof candidate !== "string" || candidate === "") return DEFAULT_DESTINATION;
  return safeActivityPath(candidate) === candidate ? candidate : DEFAULT_DESTINATION;
}

/**
 * Progress through the flow for the step indicator, counting the steps
 * before "done".
 *
 * @param steps - The planned steps.
 * @param current - The step showing.
 * @returns How many steps there are and which one (from 1) is showing.
 */
export function onboardingProgress(
  steps: readonly OnboardingStepId[],
  current: OnboardingStepId,
): { total: number; position: number } {
  const counted = steps.filter((step) => step !== "done");
  const position = current === "done" ? counted.length : counted.indexOf(current) + 1;
  return { total: counted.length, position: Math.max(position, 0) };
}

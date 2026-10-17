/**
 * The person's answer to "let people find me from their contacts", read the
 * same way by both apps: who is findable, who still needs asking, and what
 * the onboarding switch should send.
 */

import { ContactDiscovery } from "@haalkhata/protogen/common/v1/common_pb";

/** The wire enum, re-exported so no client keeps its own copy of the values. */
export { ContactDiscovery };

/**
 * Whether people can currently find this account from their contacts.
 *
 * @param answer - The caller's own `User.contact_discovery`.
 * @returns True only for an explicit yes; never asked counts as no.
 */
export function isDiscoverable(answer: ContactDiscovery): boolean {
  return answer === ContactDiscovery.ON;
}

/**
 * Whether the one-time question should still be shown.
 *
 * @param answer - The caller's own `User.contact_discovery`.
 * @returns True when the person has never answered.
 */
export function needsDiscoveryAnswer(answer: ContactDiscovery): boolean {
  return answer === ContactDiscovery.UNSPECIFIED;
}

/**
 * What the onboarding switch should save, if anything. Turning it on is an
 * answer. Leaving it off on an account that never answered is not one: the
 * switch starts off (consent is never pre-ticked), so silence is recorded as
 * nothing and the one-time prompt asks again later, in context. Turning off
 * an earlier yes is saved.
 *
 * @param stored - The answer the server holds.
 * @param wanted - Where the person left the switch.
 * @returns The value to send to SetContactDiscovery, or null to send nothing.
 */
export function onboardingDiscoveryChange(
  stored: ContactDiscovery,
  wanted: boolean,
): boolean | null {
  if (wanted) return stored === ContactDiscovery.ON ? null : true;
  return stored === ContactDiscovery.ON ? false : null;
}

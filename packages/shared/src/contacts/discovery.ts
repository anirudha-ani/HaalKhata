/**
 * The person's answer to "let people find me from their contacts", read the
 * same way by both apps: who is findable, who has not been told yet, and
 * what the onboarding switch should send.
 *
 * Being findable is the default. An account that never answered can be
 * found, like one that said yes; only an explicit no hides it. Never
 * answered still differs from yes in one way: the person has not been told,
 * so both apps say it once and offer the switch.
 */

import { ContactDiscovery } from "@haalkhata/protogen/common/v1/common_pb";

/** The wire enum, re-exported so no client keeps its own copy of the values. */
export { ContactDiscovery };

/**
 * Whether people can currently find this account from their contacts.
 *
 * @param answer - The caller's own `User.contact_discovery`.
 * @returns False only for an explicit no; never answered is the default, on.
 */
export function isDiscoverable(answer: ContactDiscovery): boolean {
  return answer !== ContactDiscovery.OFF;
}

/**
 * Whether the one-time notice should still be shown: the account is
 * findable by default and the person has not said so themselves.
 *
 * @param answer - The caller's own `User.contact_discovery`.
 * @returns True when the person has never answered.
 */
export function needsDiscoveryAnswer(answer: ContactDiscovery): boolean {
  return answer === ContactDiscovery.UNSPECIFIED;
}

/**
 * What the onboarding switch should save, if anything. The switch starts on
 * (the default) and the person sees what it means beside it, so wherever
 * they leave it is their answer: it is saved unless the server already holds
 * exactly that answer. Leaving it on records the yes, which also stops the
 * one-time notice from repeating what onboarding just said.
 *
 * @param stored - The answer the server holds.
 * @param wanted - Where the person left the switch.
 * @returns The value to send to SetContactDiscovery, or null to send nothing.
 */
export function onboardingDiscoveryChange(
  stored: ContactDiscovery,
  wanted: boolean,
): boolean | null {
  const answer = wanted ? ContactDiscovery.ON : ContactDiscovery.OFF;
  return stored === answer ? null : wanted;
}

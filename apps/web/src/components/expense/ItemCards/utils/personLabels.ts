/** How the item cards name a person: "You" for the signed-in user, a first or full name for everyone else. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";

/**
 * A person's name as a chip shows it: "You" for the signed-in user, otherwise
 * the first name. The full name stays in the accessible label.
 *
 * @param person - The person to label.
 * @param currentUserId - Id of the signed-in user.
 * @returns The short display name.
 */
export function shortName(person: User, currentUserId: string): string {
  if (person.id === currentUserId) return "You";
  return person.name.split(/\s+/)[0] || person.name;
}

/**
 * A person's name for accessible labels and claim-mode copy.
 *
 * @param person - The person to label.
 * @param currentUserId - Id of the signed-in user.
 * @returns "You" for the signed-in user, otherwise the full name.
 */
export function fullName(person: User, currentUserId: string): string {
  return person.id === currentUserId ? "You" : person.name;
}

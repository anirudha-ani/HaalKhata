/**
 * Joins FindContacts replies back to the address book: one row per account,
 * under the name(s) the person saved on this phone, grouped by what the
 * caller can do next.
 */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { ContactRelation, type FoundContact } from "@haalkhata/protogen/social/v1/social_pb";
import type { ContactLookup } from "./identifiers";

/** One account found among the caller's contacts. */
export interface FoundPerson {
  /** The account: id, name and avatar only. */
  user: User;
  /** Where the caller stands with them. */
  relation: ContactRelation;
  /** Names this person is saved under on the phone; at least one. */
  contactNames: string[];
}

/** Found people split by the action each row offers. */
export interface FoundPeopleGroups {
  /** No relation yet: Add. */
  requestable: FoundPerson[];
  /** They asked the caller first: Accept. */
  incoming: FoundPerson[];
  /** The caller's request is pending. */
  requested: FoundPerson[];
  /** Already friends. */
  friends: FoundPerson[];
}

/**
 * Merges every reply (from one or several chunked calls) into one row per
 * account. A person saved twice, or found by both a number and an email,
 * appears once with every name they are saved under. Rows are ordered by
 * the first saved name, the way the phone's own contact list reads.
 *
 * @param found - FoundContacts from every FindContacts call.
 * @param lookup - The lookup those calls were built from.
 * @returns One row per account.
 */
export function mergeFoundContacts(
  found: Pick<FoundContact, "identifier" | "user" | "relation">[],
  lookup: Pick<ContactLookup, "owners">,
): FoundPerson[] {
  const byUser = new Map<string, FoundPerson>();
  for (const contact of found) {
    if (!contact.user) continue;
    const person = byUser.get(contact.user.id) ?? {
      user: contact.user,
      relation: contact.relation,
      contactNames: [],
    };
    for (const owner of lookup.owners.get(contact.identifier) ?? []) {
      const savedName = owner.name.trim();
      if (savedName !== "" && !person.contactNames.includes(savedName)) {
        person.contactNames.push(savedName);
      }
    }
    byUser.set(contact.user.id, person);
  }
  return [...byUser.values()]
    .map((person) =>
      person.contactNames.length > 0 ? person : { ...person, contactNames: [person.user.name] },
    )
    .sort((first, second) => first.contactNames[0].localeCompare(second.contactNames[0]));
}

/**
 * Splits found people by the action their row offers, keeping order.
 *
 * @param people - Rows from {@link mergeFoundContacts}.
 * @returns The four groups the screen shows.
 */
export function groupFoundPeople(people: FoundPerson[]): FoundPeopleGroups {
  return {
    requestable: people.filter((person) => person.relation === ContactRelation.NONE),
    incoming: people.filter((person) => person.relation === ContactRelation.INCOMING),
    requested: people.filter((person) => person.relation === ContactRelation.REQUESTED),
    friends: people.filter((person) => person.relation === ContactRelation.FRIEND),
  };
}

/**
 * Moves the given people to a new relation, after a send or an accept has
 * succeeded, without asking the server again (which would use up quota).
 *
 * @param people - Current rows.
 * @param userIds - Accounts whose state changed.
 * @param relation - Their new relation.
 * @returns New rows; the input is not changed.
 */
export function withRelation(
  people: FoundPerson[],
  userIds: string[],
  relation: ContactRelation,
): FoundPerson[] {
  const changed = new Set(userIds);
  return people.map((person) => (changed.has(person.user.id) ? { ...person, relation } : person));
}

/**
 * The account name to show under the saved name, when they differ — so a
 * contact saved as "Mom" shows who is actually on HaalKhata.
 *
 * @param person - A found row.
 * @returns The account's own name, or "" when it matches the saved name.
 */
export function accountNameHint(person: FoundPerson): string {
  const accountName = person.user.name.trim();
  return person.contactNames.some(
    (savedName) => savedName.toLowerCase() === accountName.toLowerCase(),
  )
    ? ""
    : accountName;
}

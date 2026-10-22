/** Tests for joining FindContacts replies back to the address book. */

import { describe, expect, it } from "vitest";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { ContactRelation } from "@haalkhata/protogen/social/v1/social_pb";
import type { AddressBookContact } from "./identifiers";
import {
  accountNameHint,
  groupFoundPeople,
  mergeFoundContacts,
  withRelation,
} from "./matches";

/**
 * A found account as the reply carries it; only id and name are read.
 *
 * @param userId - Account id.
 * @param name - Account name.
 * @returns The user.
 */
function account(userId: string, name: string): User {
  return { id: userId, name } as User;
}

const rifat = account("rifat", "Rifat Hasan");
const tania = account("tania", "Tania");

/**
 * A saved contact.
 *
 * @param name - Saved name.
 * @returns The contact.
 */
function saved(name: string): AddressBookContact {
  return { id: name, name, phones: [], emails: [] };
}

const owners = new Map<string, AddressBookContact[]>([
  ["+8801712345678", [saved("Rifat Work")]],
  ["rifat@example.com", [saved("Rifat Hasan"), saved("Rifat Work")]],
  ["tania@example.com", [saved("Tania")]],
  ["+8801812345678", [saved("  ")]],
]);

describe("mergeFoundContacts", () => {
  it("shows one row per account with every name it is saved under, ordered by name", () => {
    const people = mergeFoundContacts(
      [
        { identifier: "tania@example.com", user: tania, relation: ContactRelation.NONE },
        { identifier: "+8801712345678", user: rifat, relation: ContactRelation.REQUESTED },
        { identifier: "rifat@example.com", user: rifat, relation: ContactRelation.REQUESTED },
      ],
      { owners },
    );
    expect(people.map((person) => [person.user.id, person.contactNames])).toEqual([
      ["rifat", ["Rifat Work", "Rifat Hasan"]],
      ["tania", ["Tania"]],
    ]);
    expect(people[0].relation).toBe(ContactRelation.REQUESTED);
  });

  it("falls back to the account name when the saved name is blank or unknown", () => {
    const people = mergeFoundContacts(
      [
        { identifier: "+8801812345678", user: tania, relation: ContactRelation.NONE },
        { identifier: "unknown@example.com", user: rifat, relation: ContactRelation.NONE },
      ],
      { owners },
    );
    expect(people.map((person) => person.contactNames)).toEqual([["Rifat Hasan"], ["Tania"]]);
  });

  it("ignores a reply without a user", () => {
    expect(
      mergeFoundContacts([{ identifier: "tania@example.com", user: undefined, relation: 1 }], { owners }),
    ).toEqual([]);
  });
});

describe("groupFoundPeople and withRelation", () => {
  const people = mergeFoundContacts(
    [
      { identifier: "tania@example.com", user: tania, relation: ContactRelation.NONE },
      { identifier: "rifat@example.com", user: rifat, relation: ContactRelation.INCOMING },
    ],
    { owners },
  );

  it("splits rows by the action they offer", () => {
    const groups = groupFoundPeople(people);
    expect(groups.requestable.map((person) => person.user.id)).toEqual(["tania"]);
    expect(groups.incoming.map((person) => person.user.id)).toEqual(["rifat"]);
    expect(groups.requested).toEqual([]);
    expect(groups.friends).toEqual([]);
  });

  it("moves rows after a send without touching the others", () => {
    const updated = withRelation(people, ["tania"], ContactRelation.REQUESTED);
    expect(groupFoundPeople(updated).requested.map((person) => person.user.id)).toEqual(["tania"]);
    expect(groupFoundPeople(people).requestable).toHaveLength(1);
  });
});

describe("accountNameHint", () => {
  it("names the account when it differs from every saved name", () => {
    expect(
      accountNameHint({ user: rifat, relation: ContactRelation.NONE, contactNames: ["Bhaiya"] }),
    ).toBe("Rifat Hasan");
  });

  it("stays empty when a saved name already is the account name", () => {
    expect(
      accountNameHint({ user: rifat, relation: ContactRelation.NONE, contactNames: ["rifat hasan"] }),
    ).toBe("");
  });
});

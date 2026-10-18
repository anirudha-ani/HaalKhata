/** Tests for running an address book through FindContacts in chunks. */

import { describe, expect, it, vi } from "vitest";
import type { FoundContact } from "@haalkhata/protogen/social/v1/social_pb";
import { lookUpInChunks } from "./chunkedLookup";

const describeFailure = (failure: unknown) => (failure instanceof Error ? failure.message : "failed");
const chunks = [
  { phones: ["+1", "+2"], emails: ["a@x.co"] },
  { phones: ["+3"], emails: ["b@x.co", "c@x.co"] },
  { phones: [], emails: ["d@x.co"] },
];
const match = (identifier: string) => ({ identifier }) as FoundContact;

describe("lookUpInChunks", () => {
  it("checks every chunk in order and gathers every match", async () => {
    const findContacts = vi
      .fn()
      .mockResolvedValueOnce({ contacts: [match("+1")], remainingToday: 100 })
      .mockResolvedValueOnce({ contacts: [match("c@x.co")], remainingToday: 97 })
      .mockResolvedValueOnce({ contacts: [], remainingToday: 96 });
    const outcome = await lookUpInChunks(chunks, findContacts, describeFailure);
    expect(findContacts.mock.calls.map(([chunk]) => chunk)).toEqual(chunks);
    expect(outcome).toEqual({
      found: [match("+1"), match("c@x.co")],
      checked: 7,
      total: 7,
      stoppedEarly: false,
      failure: "",
    });
  });

  it("stops before a chunk the day's allowance cannot cover", async () => {
    const findContacts = vi.fn().mockResolvedValueOnce({ contacts: [match("+2")], remainingToday: 2 });
    const outcome = await lookUpInChunks(chunks, findContacts, describeFailure);
    expect(findContacts).toHaveBeenCalledOnce();
    expect(outcome).toMatchObject({ found: [match("+2")], checked: 3, total: 7, stoppedEarly: true, failure: "" });
  });

  it("keeps what earlier chunks found when a later one fails", async () => {
    const findContacts = vi
      .fn()
      .mockResolvedValueOnce({ contacts: [match("+1")], remainingToday: 100 })
      .mockRejectedValueOnce(new Error("You're offline"));
    const outcome = await lookUpInChunks(chunks, findContacts, describeFailure);
    expect(outcome).toMatchObject({ found: [match("+1")], checked: 3, stoppedEarly: true, failure: "You're offline" });
  });

  it("fails the whole lookup when the first chunk fails", async () => {
    const findContacts = vi.fn().mockRejectedValueOnce(new Error("limit reached"));
    await expect(lookUpInChunks(chunks, findContacts, describeFailure)).rejects.toThrow("limit reached");
  });

  it("makes no call for an empty address book", async () => {
    const findContacts = vi.fn();
    expect(await lookUpInChunks([], findContacts, describeFailure)).toMatchObject({ found: [], total: 0 });
    expect(findContacts).not.toHaveBeenCalled();
  });
});

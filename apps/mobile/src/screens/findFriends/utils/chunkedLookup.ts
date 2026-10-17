/** Runs a whole address book through FindContacts, one chunk per call. */

import type { FoundContact } from "@haalkhata/protogen/social/v1/social_pb";
import type { ContactLookupChunk } from "@haalkhata/shared/contacts/identifiers";

/** What a lookup across several FindContacts calls found. */
export interface LookupOutcome {
  /** Every match from every call that succeeded. */
  found: FoundContact[];
  /** Identifiers checked by the calls that succeeded. */
  checked: number;
  /** Identifiers in the whole address book. */
  total: number;
  /** Whether some identifiers were left unchecked. */
  stoppedEarly: boolean;
  /** Why a later call failed, when one did; "" otherwise. */
  failure: string;
}

/** One FindContacts call, as the lookup needs it. */
export type FindContactsCall = (
  chunk: ContactLookupChunk,
) => Promise<{ contacts: FoundContact[]; remainingToday: number }>;

/**
 * Identifiers in one call.
 *
 * @param chunk - One FindContacts request's lists.
 * @returns Phones plus emails.
 */
function chunkSize(chunk: ContactLookupChunk): number {
  return chunk.phones.length + chunk.emails.length;
}

/**
 * Sends the address book in calls of the server's size, one after another.
 * It stops before a call the day's allowance could not cover (the server
 * would refuse it whole), and a call failing after earlier ones succeeded
 * keeps what they found. Only a failing first call is a failed lookup.
 *
 * @param chunks - The address book split by chunkContactLookup.
 * @param findContacts - Makes one FindContacts call.
 * @param describe - Turns a failure into the sentence shown.
 * @returns What was found and how much was checked.
 * @throws Whatever the first call throws.
 */
export async function lookUpInChunks(
  chunks: ContactLookupChunk[],
  findContacts: FindContactsCall,
  describe: (failure: unknown) => string,
): Promise<LookupOutcome> {
  const total = chunks.reduce((runningTotal, chunk) => runningTotal + chunkSize(chunk), 0);
  const found: FoundContact[] = [];
  let checked = 0;
  for (const [index, chunk] of chunks.entries()) {
    let remainingToday: number;
    try {
      const response = await findContacts(chunk);
      found.push(...response.contacts);
      remainingToday = response.remainingToday;
    } catch (failure) {
      if (checked === 0) throw failure;
      return { found, checked, total, stoppedEarly: true, failure: describe(failure) };
    }
    checked += chunkSize(chunk);
    const nextChunk = chunks.at(index + 1);
    if (nextChunk && remainingToday < chunkSize(nextChunk)) {
      return { found, checked, total, stoppedEarly: true, failure: "" };
    }
  }
  return { found, checked, total, stoppedEarly: false, failure: "" };
}

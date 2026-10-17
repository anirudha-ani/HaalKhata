/**
 * FindContacts: which phone numbers and emails from the caller's own address
 * book belong to accounts that chose to be findable.
 *
 * Nothing the caller sends is stored or logged. The identifiers live in this
 * call's memory and in the match query's parameters; the only write is the
 * day's count of how many were checked.
 */

import { ContactRelation } from "@haalkhata/protogen/social/v1/social_pb";
import { transaction } from "@/server/common/db/db";
import { exhausted, invalid } from "@/server/common/errors";
import { EMAIL_PATTERN, normalizePhone } from "@/server/auth/auth.constants";
import { isRegisteredUser, toFriendRequestUser } from "@/server/auth/usecase/identity/user.mapper";
import {
  claimLookupQuota,
  findDiscoverableAccounts,
  readLookupUsage,
  type DiscoverableAccountRow,
} from "@/server/social/repo/contacts/contactDiscovery.repo";
import {
  MAX_CONTACT_IDENTIFIER_LENGTH,
  MAX_CONTACT_IDENTIFIERS_PER_DAY,
  MAX_CONTACT_IDENTIFIERS_PER_LOOKUP,
} from "@/server/social/social.constants";

/** What the caller sent, as FindContacts receives it. */
export interface FindContactsInput {
  /** E.164 numbers normalised on the device. */
  phones: string[];
  /** Trimmed, lower-cased email addresses. */
  emails: string[];
}

/** One submitted identifier that belongs to a findable account. */
export interface FoundContactEntry {
  /** The identifier exactly as the caller sent it. */
  identifier: string;
  /** Minimal profile: id, name and avatar. */
  user: ReturnType<typeof toFriendRequestUser>;
  /** Where the caller stands with this account. */
  relation: ContactRelation;
}

/**
 * Maps each acceptable identifier's canonical spelling to the first spelling
 * the caller sent, dropping duplicates and anything unusable. Length is
 * checked before anything else, so an oversized entry is never parsed.
 *
 * @param sent - Identifiers as the caller sent them.
 * @param canonicalize - Returns the canonical spelling, or null to drop.
 * @returns Canonical spelling → spelling to echo back.
 */
function canonicalIdentifiers(
  sent: string[],
  canonicalize: (value: string) => string | null,
): Map<string, string> {
  const canonical = new Map<string, string>();
  for (const value of sent) {
    if (value.length > MAX_CONTACT_IDENTIFIER_LENGTH) continue;
    const spelling = canonicalize(value);
    if (spelling !== null && !canonical.has(spelling)) canonical.set(spelling, value);
  }
  return canonical;
}

/**
 * Canonical E.164 form of an international number. A number without its
 * country code is dropped rather than guessed against a default region: the
 * device knows which country a contact's number belongs to, and a wrong
 * guess could match a stranger.
 *
 * @param value - A number from the address book.
 * @returns The E.164 number, or null when it is not a valid international number.
 */
function canonicalPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) return null;
  return normalizePhone(trimmed);
}

/**
 * Canonical form of an email address: trimmed and lower-cased, matching how
 * the users table compares addresses.
 *
 * @param value - An email from the address book.
 * @returns The canonical address, or null when it is not an address.
 */
function canonicalEmail(value: string): string | null {
  const lowered = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(lowered) ? lowered : null;
}

/**
 * Where the caller stands with a found account. A request pending in both
 * directions reads as incoming, because accepting it settles both.
 *
 * @param account - A matched account with its relation flags.
 * @returns The relation the client shows.
 */
function relationOf(account: DiscoverableAccountRow): ContactRelation {
  if (account.is_friend) return ContactRelation.FRIEND;
  if (account.request_received) return ContactRelation.INCOMING;
  if (account.request_sent) return ContactRelation.REQUESTED;
  return ContactRelation.NONE;
}

/**
 * Identifiers left in today's allowance.
 *
 * @param checkedToday - Identifiers already counted today.
 * @returns What is left, never negative.
 */
function remainingOf(checkedToday: number): number {
  return Math.max(0, MAX_CONTACT_IDENTIFIERS_PER_DAY - checkedToday);
}

/**
 * The refusal shown when a lookup would pass the daily allowance.
 *
 * @param remaining - Identifiers still allowed today.
 * @returns A sentence the person can act on.
 */
function quotaMessage(remaining: number): string {
  if (remaining === 0) {
    return "you've checked as many contacts as HaalKhata allows in one day — try again tomorrow";
  }
  const noun = remaining === 1 ? "contact" : "contacts";
  return `HaalKhata can check ${remaining} more ${noun} today — try again tomorrow for the rest`;
}

/**
 * One entry per submitted identifier the account holds, echoed as sent.
 *
 * @param account - A matched, registered account.
 * @param phones - Canonical phone → spelling the caller sent.
 * @param emails - Canonical email → spelling the caller sent.
 * @returns The found-contact entries for this account.
 */
function foundContacts(
  account: DiscoverableAccountRow,
  phones: Map<string, string>,
  emails: Map<string, string>,
): FoundContactEntry[] {
  // Only registered accounts are found, so saying so reveals nothing more.
  const user = { ...toFriendRequestUser(account), registered: true };
  const relation = relationOf(account);
  const sent = [
    account.matched_phone === null ? undefined : phones.get(account.matched_phone),
    account.matched_email === null ? undefined : emails.get(account.matched_email),
  ];
  return sent
    .filter((identifier): identifier is string => identifier !== undefined)
    .map((identifier) => ({ identifier, user, relation }));
}

/**
 * Matches identifiers from the caller's address book against accounts that
 * opted in to being found. The day's allowance is claimed first, in the same
 * transaction as the match, so a lookup that fails counts nothing and one
 * that would pass the allowance runs no match at all.
 *
 * @param userId - Authenticated caller.
 * @param input - Phones and emails from the caller's contacts.
 * @returns The matches and the identifiers still allowed today.
 * @throws UsecaseError (invalid_argument) when the call carries more than
 *   {@link MAX_CONTACT_IDENTIFIERS_PER_LOOKUP} identifiers.
 * @throws UsecaseError (resource_exhausted) when the lookup would pass the
 *   daily allowance; nothing is counted then.
 */
export async function findContacts(
  userId: string,
  input: FindContactsInput,
): Promise<{ contacts: FoundContactEntry[]; remainingToday: number }> {
  if (input.phones.length + input.emails.length > MAX_CONTACT_IDENTIFIERS_PER_LOOKUP) {
    invalid(
      `send at most ${MAX_CONTACT_IDENTIFIERS_PER_LOOKUP} phone numbers and emails in one lookup`,
    );
  }
  const phones = canonicalIdentifiers(input.phones, canonicalPhone);
  const emails = canonicalIdentifiers(input.emails, canonicalEmail);
  const checkCount = phones.size + emails.size;
  if (checkCount === 0) {
    return { contacts: [], remainingToday: remainingOf(await readLookupUsage(userId)) };
  }
  return transaction(async (client) => {
    const checkedToday = await claimLookupQuota(
      userId,
      checkCount,
      MAX_CONTACT_IDENTIFIERS_PER_DAY,
      client,
    );
    if (checkedToday === undefined) {
      exhausted(quotaMessage(remainingOf(await readLookupUsage(userId, client))));
    }
    const accounts = await findDiscoverableAccounts(
      userId,
      [...phones.keys()],
      [...emails.keys()],
      client,
    );
    return {
      contacts: accounts
        .filter(isRegisteredUser)
        .flatMap((account) => foundContacts(account, phones, emails)),
      remainingToday: remainingOf(checkedToday),
    };
  });
}

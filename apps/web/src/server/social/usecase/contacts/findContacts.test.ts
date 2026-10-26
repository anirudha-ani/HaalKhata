/** Unit tests for FindContacts: limits, normalisation, the quota and how matches are reported. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { ContactRelation } from "@haalkhata/protogen/social/v1/social_pb";
import type { DiscoverableAccountRow } from "@/server/social/repo/contacts/contactDiscovery.repo";

const { transactionClient } = vi.hoisted(() => ({
  transactionClient: { query: vi.fn() } as unknown as PoolClient,
}));

vi.mock("@/server/common/db/db", () => ({
  transaction: vi.fn(async (operation: (client: PoolClient) => Promise<unknown>) =>
    operation(transactionClient),
  ),
}));
vi.mock("@/server/social/repo/contacts/contactDiscovery.repo", () => ({
  claimLookupQuota: vi.fn(),
  findDiscoverableAccounts: vi.fn(),
  readLookupUsage: vi.fn(),
}));

import {
  claimLookupQuota,
  findDiscoverableAccounts,
  readLookupUsage,
} from "@/server/social/repo/contacts/contactDiscovery.repo";
import { MAX_CONTACT_IDENTIFIERS_PER_DAY } from "@/server/social/social.constants";
import { findContacts } from "./findContacts.usecase";

/**
 * A matched, registered account with no relation to the caller.
 *
 * @param overrides - Columns to change.
 * @returns The row as the repo returns it.
 */
function account(overrides: Partial<DiscoverableAccountRow>): DiscoverableAccountRow {
  return {
    id: "friend-1",
    email: "rifat@example.com",
    name: "Rifat",
    avatar_color: "#0f8a5f",
    avatar_url: null,
    default_currency: "BDT",
    password_hash: null,
    phone: "+8801712345678",
    phone_verified_at: "2026-10-01T00:00:00Z",
    google_sub: "google-rifat",
    onboarded_at: "2026-10-01T00:00:00Z",
    token_version: 1,
    created_at: "2026-10-01T00:00:00Z",
    contact_discovery: true,
    matched_phone: null,
    matched_email: null,
    is_friend: false,
    request_sent: false,
    request_received: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(claimLookupQuota).mockResolvedValue(10);
  vi.mocked(findDiscoverableAccounts).mockResolvedValue([]);
  vi.mocked(readLookupUsage).mockResolvedValue(0);
});

describe("findContacts", () => {
  it("refuses more than 1,000 identifiers in one call", async () => {
    await expect(
      findContacts("caller", {
        phones: Array.from({ length: 600 }, (_unusedValue, index) => `+1617555${index}`),
        emails: Array.from({ length: 401 }, (_unusedValue, index) => `person${index}@example.com`),
      }),
    ).rejects.toMatchObject({ code: "invalid_argument" });
    expect(claimLookupQuota).not.toHaveBeenCalled();
  });

  it("drops invalid, national-only, oversized and duplicate identifiers before counting", async () => {
    await findContacts("caller", {
      phones: ["+8801712345678", "+880 1712-345678", "01712345678", "+1", "x".repeat(255)],
      emails: ["Rifat@Example.com ", "rifat@example.com", "not-an-email", `${"a".repeat(250)}@x.co`],
    });
    expect(claimLookupQuota).toHaveBeenCalledWith("caller", 2, MAX_CONTACT_IDENTIFIERS_PER_DAY, transactionClient);
    expect(findDiscoverableAccounts).toHaveBeenCalledWith(
      "caller",
      ["+8801712345678"],
      ["rifat@example.com"],
      transactionClient,
    );
  });

  it("claims nothing and matches nothing when no identifier is usable", async () => {
    vi.mocked(readLookupUsage).mockResolvedValue(1200);
    const result = await findContacts("caller", { phones: ["12"], emails: ["nope"] });
    expect(result).toEqual({ contacts: [], remainingToday: MAX_CONTACT_IDENTIFIERS_PER_DAY - 1200 });
    expect(claimLookupQuota).not.toHaveBeenCalled();
    expect(findDiscoverableAccounts).not.toHaveBeenCalled();
  });

  it("fails with resource_exhausted and the remaining count once the day's allowance is used", async () => {
    vi.mocked(claimLookupQuota).mockResolvedValue(undefined);
    vi.mocked(readLookupUsage).mockResolvedValue(MAX_CONTACT_IDENTIFIERS_PER_DAY - 40);
    await expect(
      findContacts("caller", { phones: ["+8801712345678"], emails: [] }),
    ).rejects.toMatchObject({
      code: "resource_exhausted",
      message: expect.stringContaining("40 more contacts today"),
    });
    expect(findDiscoverableAccounts).not.toHaveBeenCalled();
  });

  it("says when nothing is left today", async () => {
    vi.mocked(claimLookupQuota).mockResolvedValue(undefined);
    vi.mocked(readLookupUsage).mockResolvedValue(MAX_CONTACT_IDENTIFIERS_PER_DAY);
    await expect(
      findContacts("caller", { phones: ["+8801712345678"], emails: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining("try again tomorrow") });
  });

  it("echoes each matched identifier as sent, once per identifier, with a minimal profile", async () => {
    vi.mocked(claimLookupQuota).mockResolvedValue(2);
    vi.mocked(findDiscoverableAccounts).mockResolvedValue([
      account({ matched_phone: "+8801712345678", matched_email: "rifat@example.com" }),
    ]);
    const result = await findContacts("caller", {
      phones: ["+880 1712 345678"],
      emails: ["Rifat@Example.com"],
    });
    expect(result.remainingToday).toBe(MAX_CONTACT_IDENTIFIERS_PER_DAY - 2);
    expect(result.contacts.map((contact) => contact.identifier)).toEqual([
      "+880 1712 345678",
      "Rifat@Example.com",
    ]);
    const [first] = result.contacts;
    expect(first.relation).toBe(ContactRelation.NONE);
    expect(first.user).toMatchObject({ id: "friend-1", name: "Rifat", registered: true });
    expect(first.user.email).toBe("");
    expect(first.user.phone).toBe("");
  });

  it("maps each relation, with a two-way request reading as incoming", async () => {
    vi.mocked(findDiscoverableAccounts).mockResolvedValue([
      account({ id: "friend", matched_email: "a@example.com", is_friend: true }),
      account({ id: "incoming", matched_email: "b@example.com", request_received: true, request_sent: true }),
      account({ id: "requested", matched_email: "c@example.com", request_sent: true }),
      account({ id: "none", matched_email: "d@example.com" }),
    ]);
    const result = await findContacts("caller", {
      phones: [],
      emails: ["a@example.com", "b@example.com", "c@example.com", "d@example.com"],
    });
    expect(result.contacts.map((contact) => [contact.user.id, contact.relation])).toEqual([
      ["friend", ContactRelation.FRIEND],
      ["incoming", ContactRelation.INCOMING],
      ["requested", ContactRelation.REQUESTED],
      ["none", ContactRelation.NONE],
    ]);
  });

  it("never reports an unregistered row, even if one were marked findable", async () => {
    vi.mocked(findDiscoverableAccounts).mockResolvedValue([
      account({ id: "invited", google_sub: null, matched_email: "rifat@example.com" }),
    ]);
    const result = await findContacts("caller", { phones: [], emails: ["rifat@example.com"] });
    expect(result.contacts).toEqual([]);
  });
});

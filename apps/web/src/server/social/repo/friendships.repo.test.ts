/** SQL-boundary regressions for consent-based friendship creation. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const database = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/server/common/db/db", () => database);

import {
  countIncomingFriendRequests,
  deleteFriendRequest,
  deleteOutgoingFriendRequest,
  friendshipExists,
  insertFriendRequest,
  insertFriendship,
  insertFriendships,
} from "./friendships.repo";

const REQUESTER = "user-requester";
const RECIPIENT = "user-recipient";
const transactionClient = { query: vi.fn() } as unknown as PoolClient;

beforeEach(() => {
  vi.clearAllMocks();
  database.transaction.mockImplementation((operation) => operation(transactionClient));
});

describe("friend request persistence", () => {
  it("reports whether an idempotent pending-request insert created a row", async () => {
    database.queryOne.mockResolvedValueOnce({ requester_id: REQUESTER });
    await expect(insertFriendRequest(REQUESTER, RECIPIENT)).resolves.toBe(true);

    expect(transactionClient.query).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
      [[`friend-request-inbox:${REQUESTER}`, `friend-request-inbox:${RECIPIENT}`]],
    );
    expect(database.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("usr.deleted_at IS NULL"),
      [REQUESTER, RECIPIENT, expect.any(Number), null],
      transactionClient,
    );

    database.queryOne.mockResolvedValueOnce(undefined);
    await expect(insertFriendRequest(REQUESTER, RECIPIENT)).resolves.toBe(false);
  });

  it("stores the identifier the requester typed so it can be echoed back", async () => {
    database.queryOne.mockResolvedValueOnce({ requester_id: REQUESTER });

    await insertFriendRequest(REQUESTER, RECIPIENT, undefined, "friend@example.com");

    expect(database.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("recipient_identifier"),
      [REQUESTER, RECIPIENT, expect.any(Number), "friend@example.com"],
      transactionClient,
    );
  });

  it("withdraws a sent request under both inbox locks after resolving its recipient", async () => {
    database.queryOne
      .mockResolvedValueOnce({ recipient_id: RECIPIENT })
      .mockResolvedValueOnce({ requester_id: REQUESTER });

    await expect(
      deleteOutgoingFriendRequest(REQUESTER, { recipientIdentifier: "friend@example.com" }),
    ).resolves.toBe(true);

    expect(database.queryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("recipient_identifier = $3"),
      [REQUESTER, null, "friend@example.com"],
      transactionClient,
    );
    expect(transactionClient.query).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
      [expect.arrayContaining([`friend-request-inbox:${RECIPIENT}`])],
    );
    expect(database.queryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("DELETE FROM friend_requests"),
      [REQUESTER, RECIPIENT],
      transactionClient,
    );
  });

  it("takes no locks and removes nothing when no such sent request exists", async () => {
    database.queryOne.mockResolvedValueOnce(undefined);

    await expect(deleteOutgoingFriendRequest(REQUESTER, { recipientId: RECIPIENT })).resolves.toBe(false);

    expect(transactionClient.query).not.toHaveBeenCalled();
    expect(database.queryOne).toHaveBeenCalledOnce();
  });

  it("counts the requests addressed to the recipient", async () => {
    database.queryOne.mockResolvedValueOnce({ pending_count: 4 });

    await expect(countIncomingFriendRequests(RECIPIENT)).resolves.toBe(4);

    expect(database.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("WHERE recipient_id = $1"),
      [RECIPIENT],
    );
  });

  it("checks accepted friendship state with the exact directed pair", async () => {
    database.queryOne.mockResolvedValue({ matched: 1 });

    await expect(friendshipExists(REQUESTER, RECIPIENT)).resolves.toBe(true);

    expect(database.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("user_id = $1 AND friend_id = $2"),
      [REQUESTER, RECIPIENT],
    );
  });

  it("consumes only the directed request addressed to the recipient", async () => {
    database.queryOne.mockResolvedValue({ requester_id: REQUESTER });

    await expect(
      deleteFriendRequest(REQUESTER, RECIPIENT, transactionClient),
    ).resolves.toBe(true);

    expect(database.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("requester_id = $1 AND recipient_id = $2"),
      [REQUESTER, RECIPIENT],
      transactionClient,
    );
  });

  it("removes pending requests before creating symmetric friendship rows", async () => {
    await insertFriendship(REQUESTER, RECIPIENT, transactionClient);

    expect(database.execute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM friend_requests"),
      [REQUESTER, [RECIPIENT]],
      transactionClient,
    );
    expect(database.execute).toHaveBeenCalledWith(
      expect.stringMatching(/VALUES \(\$1::text, friend\.id\), \(friend\.id, \$1::text\).*deleted_at IS NULL/s),
      [REQUESTER, [RECIPIENT]],
      transactionClient,
    );
  });

  it("befriends one person with many in three statements, locking every inbox at once", async () => {
    const friends = ["user-b", "user-c", "user-b", "", REQUESTER];

    await insertFriendships(REQUESTER, friends, transactionClient);

    expect(transactionClient.query).toHaveBeenCalledTimes(1);
    expect(transactionClient.query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), [
      [`friend-request-inbox:${REQUESTER}`, "friend-request-inbox:user-b", "friend-request-inbox:user-c"],
    ]);
    expect(database.execute).toHaveBeenCalledTimes(2);
    expect(database.execute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM friend_requests"),
      [REQUESTER, ["user-b", "user-c"]],
      transactionClient,
    );
  });

  it("does nothing for a person befriended with nobody but themselves", async () => {
    await insertFriendships(REQUESTER, [REQUESTER, ""], transactionClient);

    expect(transactionClient.query).not.toHaveBeenCalled();
    expect(database.execute).not.toHaveBeenCalled();
  });
});

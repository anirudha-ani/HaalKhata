/** SQL-boundary regressions for consent-based friendship creation. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const database = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/server/common/db", () => database);

import {
  deleteFriendRequest,
  friendshipExists,
  insertFriendRequest,
  insertFriendship,
} from "./friendships.repo";

const REQUESTER = "user-requester";
const RECIPIENT = "user-recipient";
const transactionClient = {} as PoolClient;

beforeEach(() => {
  vi.clearAllMocks();
  database.transaction.mockImplementation((operation) => operation(transactionClient));
});

describe("friend request persistence", () => {
  it("reports whether an idempotent pending-request insert created a row", async () => {
    database.queryOne.mockResolvedValueOnce({ requester_id: REQUESTER });
    await expect(insertFriendRequest(REQUESTER, RECIPIENT)).resolves.toBe(true);

    expect(database.execute).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
      [`friend-request-inbox:${REQUESTER}`],
      transactionClient,
    );
    expect(database.execute).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
      [`friend-request-inbox:${RECIPIENT}`],
      transactionClient,
    );
    expect(database.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("usr.merged_into IS NULL"),
      [REQUESTER, RECIPIENT, expect.any(Number)],
      transactionClient,
    );

    database.queryOne.mockResolvedValueOnce(undefined);
    await expect(insertFriendRequest(REQUESTER, RECIPIENT)).resolves.toBe(false);
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
      [REQUESTER, RECIPIENT],
      transactionClient,
    );
    expect(database.execute).toHaveBeenCalledWith(
      expect.stringMatching(/VALUES \(\$1::text, \$2::text\).*merged_into IS NULL/s),
      [REQUESTER, RECIPIENT],
      transactionClient,
    );
  });
});

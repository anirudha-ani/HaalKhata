/** Regression tests for atomic Google authentication nonce persistence. */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/common/db", () => ({
  execute: vi.fn(),
  queryOne: vi.fn(),
}));

import { execute, queryOne } from "@/server/common/db";
import { consumeGoogleSignInNonce, insertGoogleSignInNonce } from "./googleSignInNonces.repo";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Google sign-in nonce persistence", () => {
  it("purges expired challenges and inserts only the hash with a bounded lifetime", async () => {
    await insertGoogleSignInNonce("a".repeat(64), 300);

    expect(execute).toHaveBeenNthCalledWith(
      1,
      "DELETE FROM google_sign_in_nonces WHERE expires_at <= NOW()",
      [],
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("VALUES ($1, NOW() + make_interval(secs => $2))"),
      ["a".repeat(64), 300],
    );
  });

  it("deletes and returns an unexpired challenge in one statement", async () => {
    vi.mocked(queryOne).mockResolvedValue({ nonce_hash: "b".repeat(64) });

    await expect(consumeGoogleSignInNonce("b".repeat(64))).resolves.toBe(true);

    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining("WHERE nonce_hash = $1 AND expires_at > NOW()"),
      ["b".repeat(64)],
    );
  });

  it("rejects an expired, unknown, or already-consumed challenge", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);

    await expect(consumeGoogleSignInNonce("c".repeat(64))).resolves.toBe(false);
  });
});

/** Tests for planned session-key rotation: the previous key verifies, never signs, and only while configured. */

import { afterAll, describe, expect, it, vi } from "vitest";

const OLD_KEY = "a".repeat(64);
const NEW_KEY = "b".repeat(64);
const savedSecret = process.env.SESSION_SECRET;
const savedPrevious = process.env.SESSION_SECRET_PREVIOUS;

/**
 * Loads a fresh copy of the auth usecase under the given keys, since the
 * module caches the decoded secret for the life of the process.
 *
 * @param current - SESSION_SECRET to run with.
 * @param previous - SESSION_SECRET_PREVIOUS, or undefined for none.
 * @returns The freshly imported module.
 */
async function authUnder(current: string, previous: string | undefined) {
  vi.resetModules();
  process.env.SESSION_SECRET = current;
  if (previous === undefined) delete process.env.SESSION_SECRET_PREVIOUS;
  else process.env.SESSION_SECRET_PREVIOUS = previous;
  return import("./auth.usecase");
}

afterAll(() => {
  if (savedSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = savedSecret;
  if (savedPrevious === undefined) delete process.env.SESSION_SECRET_PREVIOUS;
  else process.env.SESSION_SECRET_PREVIOUS = savedPrevious;
  vi.resetModules();
});

describe("session key ring", () => {
  it("keeps sessions valid across a planned rotation, and drops them once the old key is retired", async () => {
    const before = await authUnder(OLD_KEY, undefined);
    const token = before.createToken("user-1", 0);

    // Rotation in flight: new key signs, old key still verifies.
    const during = await authUnder(NEW_KEY, OLD_KEY);
    expect(during.verifyToken(token)).toBe("user-1");
    const fresh = during.createToken("user-1", 0);
    expect(fresh).not.toBe(token);
    expect(during.verifyToken(fresh)).toBe("user-1");

    // Rotation finished: the old key is gone, and so are its sessions —
    // which is also what an incident rotation looks like from the start.
    const after = await authUnder(NEW_KEY, undefined);
    expect(after.verifyToken(token)).toBeNull();
    expect(after.verifyToken(fresh)).toBe("user-1");
  });
});

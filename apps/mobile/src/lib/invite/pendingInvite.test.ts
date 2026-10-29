/** A join link saved for sign-in lasts half an hour and is taken once; anything older, or saved without a time, is dropped. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEGACY_PENDING_INVITE_STORAGE_KEY,
  PENDING_INVITE_STORAGE_KEY,
} from "./constants/pendingInvite";
import { clearPendingInvite, stashPendingInvite, takePendingInvite } from "./pendingInvite";

const stored = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (storageKey: string) => stored.get(storageKey) ?? null,
    setItem: async (storageKey: string, value: string) => void stored.set(storageKey, value),
    multiRemove: async (keys: string[]) => {
      for (const storageKey of keys) stored.delete(storageKey);
    },
  },
}));

const SAVED_AT = new Date("2026-10-29T09:00:00Z");

/**
 * Moves the phone's clock on from when the link was saved.
 *
 * @param minutes - Minutes since it was saved.
 */
function minutesLater(minutes: number) {
  vi.setSystemTime(SAVED_AT.getTime() + minutes * 60_000);
}

beforeEach(() => {
  stored.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SAVED_AT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a join link saved for sign-in", () => {
  it("is there for a sign-in that follows, once", async () => {
    await stashPendingInvite("flat-link");
    minutesLater(12);

    expect(await takePendingInvite()).toBe("flat-link");
    expect(await takePendingInvite()).toBeNull();
  });

  it("is dropped once half an hour has gone by without a sign-in", async () => {
    await stashPendingInvite("flat-link");
    minutesLater(31);

    expect(await takePendingInvite()).toBeNull();
    expect(stored.size).toBe(0);
  });

  it("is dropped when the clock says it was saved in the future", async () => {
    await stashPendingInvite("flat-link");
    minutesLater(-5);

    expect(await takePendingInvite()).toBeNull();
  });

  it("is dropped when an earlier version saved it with no time on it", async () => {
    stored.set(LEGACY_PENDING_INVITE_STORAGE_KEY, "flat-link");

    expect(await takePendingInvite()).toBeNull();
    expect(stored.size).toBe(0);
  });

  it("is dropped when what is saved cannot be read", async () => {
    stored.set(PENDING_INVITE_STORAGE_KEY, "{not json");

    expect(await takePendingInvite()).toBeNull();
    expect(stored.size).toBe(0);
  });

  it("is gone after clearing, both the current kind and the old", async () => {
    await stashPendingInvite("flat-link");
    stored.set(LEGACY_PENDING_INVITE_STORAGE_KEY, "older-link");

    await clearPendingInvite();

    expect(stored.size).toBe(0);
  });
});

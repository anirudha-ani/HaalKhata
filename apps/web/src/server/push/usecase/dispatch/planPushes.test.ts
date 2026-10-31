/** Tests for the dispatcher's pure decisions: who gets which push, and when to retry. */

import { describe, expect, it } from "vitest";
import { DEFAULT_PUSH_PREFERENCES } from "@haalkhata/shared/notifications/categories";
import { PUSH_MAX_AGE_SECONDS, PUSH_PAIR_CAP, PUSH_RETRY_DELAYS_SECONDS } from "@/server/push/push.constants";
import type { PushDeviceRow } from "@/server/push/repo/pushDevices.repo";
import type { ClaimedPushRow } from "@/server/push/repo/pushOutbox.repo";
import { isExpired, planPushes, retryDelaySeconds, type PushPlanInput } from "./planPushes";

const CLOCK_MS = Date.parse("2026-10-16T12:00:00.000Z");

/**
 * A claimed outbox row with defaults.
 *
 * @param overrides - Fields to change.
 * @returns The row.
 */
function claimed(overrides: Partial<ClaimedPushRow> = {}): ClaimedPushRow {
  return {
    notification_id: "note-1",
    user_id: "user-b",
    attempts: 1,
    queued_at: new Date(CLOCK_MS - 5_000).toISOString(),
    type: "expense_added",
    title: 'Ani added "Dinner"',
    body: "Goa trip",
    link: "/expenses/exp-1",
    actor_id: "user-a",
    expense_group_id: "grp-1",
    recent_from_actor: 1,
    delivered_device_ids: [],
    ...overrides,
  };
}

/**
 * A live phone.
 *
 * @param identifier - Device id.
 * @param owner - Owner's user id.
 * @returns The row.
 */
function phone(identifier: string, owner = "user-b"): PushDeviceRow {
  return {
    id: identifier,
    user_id: owner,
    installation_id: `install-${identifier}`,
    expo_token: `ExponentPushToken[${identifier}]`,
    platform: "ios",
    label: "iPhone",
    app_version: "1.1.0",
    token_version: 0,
    session_id: null,
    created_at: "2026-10-01T00:00:00.000Z",
    last_seen_at: "2026-10-16T00:00:00.000Z",
    last_sent_at: null,
  };
}

/**
 * Plan input with one recipient who has one phone and default switches.
 *
 * @param overrides - Fields to change.
 * @returns The input.
 */
function input(overrides: Partial<PushPlanInput> = {}): PushPlanInput {
  return {
    rows: [claimed()],
    devicesByUser: new Map([["user-b", [phone("dev-1")]]]),
    preferencesByUser: new Map(),
    unreadByUser: new Map([["user-b", 3]]),
    nowMs: CLOCK_MS,
    ...overrides,
  };
}

describe("planPushes", () => {
  it("sends one message per phone, with the unread count as the badge", () => {
    const plan = planPushes(input({ devicesByUser: new Map([["user-b", [phone("dev-1"), phone("dev-2")]]]) }));
    expect(plan.outgoing.map((planned) => planned.deviceId)).toEqual(["dev-1", "dev-2"]);
    expect(plan.outgoing.every((planned) => planned.message.badge === 3)).toBe(true);
    expect(plan.skipped).toEqual([]);
  });

  it("sends a retried row only to the phones it has not reached", () => {
    const devices = new Map([["user-b", [phone("dev-1"), phone("dev-2")]]]);
    const retried = planPushes(input({ rows: [claimed({ delivered_device_ids: ["dev-1"] })], devicesByUser: devices }));
    expect(retried.outgoing.map((planned) => planned.deviceId)).toEqual(["dev-2"]);
    const reachedAll = planPushes(input({ rows: [claimed({ delivered_device_ids: ["dev-1", "dev-2"] })], devicesByUser: devices }));
    expect(reachedAll.outgoing).toEqual([]);
    expect(reachedAll.skipped).toEqual(["note-1"]);
  });

  it("skips a row whose category the recipient switched off", () => {
    const plan = planPushes(
      input({ preferencesByUser: new Map([["user-b", { ...DEFAULT_PUSH_PREFERENCES, expenses: false }]]) }),
    );
    expect(plan.outgoing).toEqual([]);
    expect(plan.skipped).toEqual(["note-1"]);
  });

  it("still sends the security alert with every switch off", () => {
    const allOff = { expenses: false, comments: false, payments: false, groups: false, friends: false };
    const plan = planPushes(
      input({
        rows: [claimed({ type: "phone_transferred", actor_id: null, link: "/account" })],
        preferencesByUser: new Map([["user-b", allOff]]),
      }),
    );
    expect(plan.outgoing).toHaveLength(1);
  });

  it("skips a recipient with no live phone", () => {
    const plan = planPushes(input({ devicesByUser: new Map() }));
    expect(plan.skipped).toEqual(["note-1"]);
  });

  it("skips pushes over the per-pair cap and keeps the ones under it", () => {
    const plan = planPushes(
      input({
        rows: [
          claimed({ notification_id: "at-cap", recent_from_actor: PUSH_PAIR_CAP }),
          claimed({ notification_id: "over-cap", recent_from_actor: PUSH_PAIR_CAP + 1 }),
        ],
      }),
    );
    expect(plan.outgoing.map((planned) => planned.notificationId)).toEqual(["at-cap"]);
    expect(plan.skipped).toEqual(["over-cap"]);
  });

  it("fails closed on a kind it does not know", () => {
    expect(planPushes(input({ rows: [claimed({ type: "other" })] })).skipped).toEqual(["note-1"]);
  });

  it("drops a row queued longer ago than the age limit", () => {
    const stale = new Date(CLOCK_MS - (PUSH_MAX_AGE_SECONDS + 1) * 1_000).toISOString();
    const plan = planPushes(input({ rows: [claimed({ queued_at: stale })] }));
    expect(plan.expired).toEqual(["note-1"]);
    expect(plan.outgoing).toEqual([]);
  });
});

describe("isExpired", () => {
  it("is false inside the window and true past it", () => {
    expect(isExpired(new Date(CLOCK_MS - 1_000).toISOString(), CLOCK_MS)).toBe(false);
    expect(isExpired(new Date(CLOCK_MS - PUSH_MAX_AGE_SECONDS * 1_000 - 1).toISOString(), CLOCK_MS)).toBe(true);
  });
});

describe("retryDelaySeconds", () => {
  const justQueued = new Date(CLOCK_MS).toISOString();

  it("backs off by attempt number", () => {
    PUSH_RETRY_DELAYS_SECONDS.forEach((delay, index) => {
      expect(retryDelaySeconds(index + 1, justQueued, CLOCK_MS)).toBe(delay);
    });
  });

  it("gives up once the attempts run out", () => {
    expect(retryDelaySeconds(PUSH_RETRY_DELAYS_SECONDS.length + 1, justQueued, CLOCK_MS)).toBeUndefined();
  });

  it("gives up when the next attempt would land past the age limit", () => {
    const almostStale = new Date(CLOCK_MS - (PUSH_MAX_AGE_SECONDS - 10) * 1_000).toISOString();
    expect(retryDelaySeconds(1, almostStale, CLOCK_MS)).toBeUndefined();
  });
});

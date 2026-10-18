/** Tests for sending friend requests in batches. */

import { describe, expect, it, vi } from "vitest";
import { sendInBatches } from "./batchedSend";

const describeFailure = (failure: unknown) => (failure instanceof Error ? failure.message : "failed");
const people = Array.from({ length: 120 }, (_unusedValue, index) => `person-${index}`);

describe("sendInBatches", () => {
  it("asks everyone in batches of the server's limit", async () => {
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    const outcome = await sendInBatches(people, sendBatch, describeFailure);
    expect(sendBatch.mock.calls.map(([batch]) => batch.length)).toEqual(Array.from({ length: 12 }, () => 10));
    expect(outcome).toEqual({ sent: people, failure: "" });
  });

  it("reports who was asked and why the rest were not when a later batch fails", async () => {
    const sendBatch = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("too many requests, please try again later"));
    const outcome = await sendInBatches(people, sendBatch, describeFailure);
    expect(outcome.sent).toEqual(people.slice(0, 10));
    expect(outcome.failure).toBe("too many requests, please try again later");
  });

  it("fails the whole send when the first batch fails", async () => {
    const sendBatch = vi.fn().mockRejectedValueOnce(new Error("offline"));
    await expect(sendInBatches(["person-1"], sendBatch, describeFailure)).rejects.toThrow("offline");
  });
});

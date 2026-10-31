/** Receipt-scan lanes: a few at once, a short first-come line, one scan per person, and a scan stops when its person leaves. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECEIPT_TIMEOUT_MS } from "@haalkhata/shared/api/timeouts";
import {
  PROVIDER_TIMEOUT_MS,
  RECEIPT_SCAN_BUSY_MESSAGE,
  RECEIPT_SCAN_LINE_WAIT_MS,
  RECEIPT_SCAN_REPLACED_MESSAGE,
  RECEIPT_SCAN_STOPPED_MESSAGE,
} from "@/server/receipt/receipt.constants";
import { createScanLanes, type ScanLane } from "./scanLanes";

/** Two lanes, a line of two, a one-second wait. */
const LIMITS = { lanes: 2, lineLength: 2, waitMs: 1000 };

/** A request nobody cancels, and one that can be. */
const request = () => new AbortController();

/**
 * What a pending promise has come to so far, without waiting for it.
 *
 * @param pending - The promise.
 * @returns "waiting", or what it resolved or rejected with.
 */
async function stateOf(pending: Promise<unknown>): Promise<unknown> {
  let state: unknown = "waiting";
  pending.then((value) => (state = value), (error: unknown) => (state = error));
  // Let anything already settled finish its hops through the microtask queue.
  for (let tick = 0; tick < 10; tick++) await Promise.resolve();
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("receipt scan lanes", () => {
  it("runs as many scans as there are lanes, and lines up the next ones first come first served", async () => {
    const lanes = createScanLanes(LIMITS);
    const first = await lanes.enter("ana", request().signal);
    await lanes.enter("ben", request().signal);

    const cyEntry = lanes.enter("cy", request().signal);
    const deeEntry = lanes.enter("dee", request().signal);
    expect(lanes.usage()).toEqual({ running: 2, waiting: 2 });
    expect(await stateOf(cyEntry)).toBe("waiting");

    first.release();
    expect(await stateOf(cyEntry)).toMatchObject({ signal: expect.any(AbortSignal) });
    expect(await stateOf(deeEntry)).toBe("waiting");
    expect(lanes.usage()).toEqual({ running: 2, waiting: 1 });
  });

  it("tells a scan at once that scanning is busy when the line is full", async () => {
    const lanes = createScanLanes(LIMITS);
    for (const person of ["ana", "ben"]) await lanes.enter(person, request().signal);
    void lanes.enter("cy", request().signal).catch(() => undefined);
    void lanes.enter("dee", request().signal).catch(() => undefined);

    await expect(lanes.enter("eve", request().signal)).rejects.toMatchObject({
      code: "resource_exhausted",
      message: RECEIPT_SCAN_BUSY_MESSAGE,
    });
  });

  it("tells a scan that waited too long that scanning is busy, and takes it out of line", async () => {
    const lanes = createScanLanes(LIMITS);
    for (const person of ["ana", "ben"]) await lanes.enter(person, request().signal);
    const cyEntry = lanes.enter("cy", request().signal);
    const outcome = cyEntry.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(LIMITS.waitMs);

    expect(await outcome).toMatchObject({ code: "resource_exhausted", message: RECEIPT_SCAN_BUSY_MESSAGE });
    expect(lanes.usage()).toEqual({ running: 2, waiting: 0 });
  });

  it("stops a person's running scan when they start another", async () => {
    const lanes = createScanLanes(LIMITS);
    const older = await lanes.enter("ana", request().signal);

    const newer = await lanes.enter("ana", request().signal);

    expect(older.signal.aborted).toBe(true);
    expect(older.signal.reason).toMatchObject({ code: "aborted", message: RECEIPT_SCAN_REPLACED_MESSAGE });
    expect(newer.signal.aborted).toBe(false);
  });

  it("replaces a person's scan that is still waiting with their newer one", async () => {
    const lanes = createScanLanes(LIMITS);
    for (const person of ["ana", "ben"]) await lanes.enter(person, request().signal);
    const older = lanes.enter("cy", request().signal).catch((error: unknown) => error);

    const newer = lanes.enter("cy", request().signal);

    expect(await older).toMatchObject({ code: "aborted", message: RECEIPT_SCAN_REPLACED_MESSAGE });
    expect(lanes.usage()).toEqual({ running: 2, waiting: 1 });
    expect(await stateOf(newer)).toBe("waiting");
  });

  it("stops a scan whose request goes away, running or waiting, and gives its place to the next", async () => {
    const lanes = createScanLanes(LIMITS);
    const anaRequest = request();
    const anaLane = await lanes.enter("ana", anaRequest.signal);
    await lanes.enter("ben", request().signal);
    const cyRequest = request();
    const cyEntry = lanes.enter("cy", cyRequest.signal).catch((error: unknown) => error);
    const deeEntry = lanes.enter("dee", request().signal);

    cyRequest.abort();
    expect(await cyEntry).toMatchObject({ code: "aborted", message: RECEIPT_SCAN_STOPPED_MESSAGE });

    anaRequest.abort();
    expect(anaLane.signal.aborted).toBe(true);
    anaLane.release();
    expect(await stateOf(deeEntry)).toMatchObject({ signal: expect.any(AbortSignal) });
  });

  it("refuses a request that is already gone, and releases a lane only once", async () => {
    const lanes = createScanLanes(LIMITS);
    const gone = request();
    gone.abort();
    await expect(lanes.enter("ana", gone.signal)).rejects.toMatchObject({ code: "aborted" });

    const lane: ScanLane = await lanes.enter("ben", request().signal);
    lane.release();
    lane.release();
    expect(lanes.usage()).toEqual({ running: 0, waiting: 0 });
  });

  it("answers within the apps' own limit on a scan, however long the wait in line and the provider take", () => {
    expect(RECEIPT_SCAN_LINE_WAIT_MS + PROVIDER_TIMEOUT_MS).toBeLessThan(RECEIPT_TIMEOUT_MS);
  });
});

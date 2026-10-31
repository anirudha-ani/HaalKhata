/** The claims sweep removes old claims in batches, on a timer, after migrations, and never takes the process down. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isMigrated: vi.fn(),
  pruneExpiredOperations: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/server/common/db/db", () => ({ isMigrated: mocks.isMigrated }));
vi.mock("@/server/common/logger", () => ({ logError: mocks.logError }));
vi.mock("./operations.repo", () => ({ pruneExpiredOperations: mocks.pruneExpiredOperations }));

import { OPERATION_SWEEP_BATCH_SIZE, OPERATION_SWEEP_INTERVAL_MS, OPERATION_SWEEP_MAX_BATCHES } from "./operations.constants";
import { startOperationsSweep, sweepExpiredOperations } from "./operationsSweep";

const cache = globalThis as unknown as { __haalkhataOperationsSweep?: { stop(): void } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  cache.__haalkhataOperationsSweep?.stop();
  delete cache.__haalkhataOperationsSweep;
  vi.useRealTimers();
});

describe("sweepExpiredOperations", () => {
  it("keeps removing full batches until one comes back short", async () => {
    mocks.pruneExpiredOperations
      .mockResolvedValueOnce(OPERATION_SWEEP_BATCH_SIZE)
      .mockResolvedValueOnce(OPERATION_SWEEP_BATCH_SIZE)
      .mockResolvedValueOnce(3);

    await expect(sweepExpiredOperations()).resolves.toBe(2 * OPERATION_SWEEP_BATCH_SIZE + 3);
    expect(mocks.pruneExpiredOperations).toHaveBeenCalledTimes(3);
    expect(mocks.pruneExpiredOperations).toHaveBeenCalledWith(OPERATION_SWEEP_BATCH_SIZE);
  });

  it("stops at the per-sweep limit and leaves the rest for the next one", async () => {
    mocks.pruneExpiredOperations.mockResolvedValue(OPERATION_SWEEP_BATCH_SIZE);

    await sweepExpiredOperations();

    expect(mocks.pruneExpiredOperations).toHaveBeenCalledTimes(OPERATION_SWEEP_MAX_BATCHES);
  });
});

describe("startOperationsSweep", () => {
  it("sweeps on its timer once migrations are in, and not before", async () => {
    mocks.pruneExpiredOperations.mockResolvedValue(0);
    mocks.isMigrated.mockReturnValue(false);
    startOperationsSweep();

    await vi.advanceTimersByTimeAsync(OPERATION_SWEEP_INTERVAL_MS);
    expect(mocks.pruneExpiredOperations).not.toHaveBeenCalled();

    mocks.isMigrated.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(OPERATION_SWEEP_INTERVAL_MS);
    expect(mocks.pruneExpiredOperations).toHaveBeenCalledOnce();
  });

  it("logs a failed sweep and sweeps again next time", async () => {
    mocks.isMigrated.mockReturnValue(true);
    mocks.pruneExpiredOperations.mockRejectedValueOnce(new Error("database down")).mockResolvedValue(0);
    startOperationsSweep();

    await vi.advanceTimersByTimeAsync(OPERATION_SWEEP_INTERVAL_MS);
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), { scope: "operations-sweep" });

    await vi.advanceTimersByTimeAsync(OPERATION_SWEEP_INTERVAL_MS);
    expect(mocks.pruneExpiredOperations).toHaveBeenCalledTimes(2);
  });

  it("starts one sweep per process", async () => {
    mocks.isMigrated.mockReturnValue(true);
    mocks.pruneExpiredOperations.mockResolvedValue(0);
    startOperationsSweep();
    startOperationsSweep();

    await vi.advanceTimersByTimeAsync(OPERATION_SWEEP_INTERVAL_MS);

    expect(mocks.pruneExpiredOperations).toHaveBeenCalledOnce();
  });
});

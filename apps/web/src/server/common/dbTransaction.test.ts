/** Regression tests for transaction rollback failures and pool-client disposal. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { transaction } from "./db";

/** Mutable global cache shape used by the database module across hot reloads. */
interface DatabaseGlobalCache {
  __haalkhataPool?: Pool;
}

const globalCache = globalThis as unknown as DatabaseGlobalCache;
let previousPool: Pool | undefined;

/**
 * Installs a mocked pool that returns the provided client.
 *
 * @param client - Mocked transaction client to lend.
 */
function installPool(client: PoolClient): void {
  globalCache.__haalkhataPool = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
}

/**
 * Builds the minimal mocked client needed by the transaction helper.
 *
 * @returns A client with query and release spies.
 */
function clientStub(): PoolClient {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  } as unknown as PoolClient;
}

beforeEach(() => {
  previousPool = globalCache.__haalkhataPool;
});

afterEach(() => {
  globalCache.__haalkhataPool = previousPool;
  vi.restoreAllMocks();
});

describe("transaction client disposal", () => {
  it("returns a client normally after a successful rollback", async () => {
    const client = clientStub();
    const originalError = new Error("write failed");
    installPool(client);

    await expect(
      transaction(async () => {
        throw originalError;
      }),
    ).rejects.toBe(originalError);

    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(client.query).toHaveBeenNthCalledWith(2, "ROLLBACK");
    expect(client.release).toHaveBeenCalledWith();
  });

  it("destroys the client but preserves the original error when rollback fails", async () => {
    const client = clientStub();
    const originalError = new Error("operation failed");
    const rollbackError = new Error("connection lost during rollback");
    vi.mocked(client.query).mockImplementation(async (statement) => {
      if (statement === "ROLLBACK") throw rollbackError;
      return { rows: [] } as never;
    });
    installPool(client);

    await expect(
      transaction(async () => {
        throw originalError;
      }),
    ).rejects.toBe(originalError);

    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(rollbackError);
  });

  it("does not replace the original error if client disposal also throws", async () => {
    const client = clientStub();
    const originalError = new Error("operation failed");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(client.release).mockImplementation(() => {
      throw new Error("release failed");
    });
    installPool(client);

    await expect(
      transaction(async () => {
        throw originalError;
      }),
    ).rejects.toBe(originalError);
    expect(errorLog).toHaveBeenCalledOnce();
  });
});

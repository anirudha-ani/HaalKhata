/** Unit tests for idempotent operations: id validation, fingerprints, and claim/replay semantics. */

import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./operations.repo", () => ({
  claimOperation: vi.fn(),
  findOperation: vi.fn(),
  completeOperation: vi.fn(),
}));

import { claimOperation, completeOperation, findOperation } from "./operations.repo";
import { assertOperationId, beginOperation, finishOperation, requestFingerprint } from "./operations";

const client = {} as PoolClient;
const operation = { userId: "user-1", rpc: "CreateExpense", operationId: "op-1" };
const request = { groupId: "g", amountCents: 500, operationId: "op-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertOperationId", () => {
  it("accepts a UUID and a random token", () => {
    expect(assertOperationId("8f0f0f1e-2c0d-4b6b-9f1a-0c1d2e3f4a5b")).toBe(
      "8f0f0f1e-2c0d-4b6b-9f1a-0c1d2e3f4a5b",
    );
    expect(assertOperationId("abc_DEF-123")).toBe("abc_DEF-123");
  });

  it("refuses a missing, oversized, or odd id", () => {
    // Required, not optional: without it a retry is indistinguishable from a
    // second deliberate action.
    expect(() => assertOperationId("")).toThrow(/operation_id is required/);
    expect(() => assertOperationId("x".repeat(65))).toThrow(/too long/);
    expect(() => assertOperationId("has space")).toThrow(/letters, digits/);
    expect(() => assertOperationId("semi;colon")).toThrow(/letters, digits/);
  });
});

describe("requestFingerprint", () => {
  it("ignores operation order and the operation id itself", () => {
    const first = requestFingerprint({ b: 1, a: [{ y: 2, x: 1 }], operationId: "one" });
    const second = requestFingerprint({ a: [{ x: 1, y: 2 }], b: 1, operationId: "two" });
    expect(first).toBe(second);
  });

  it("changes when the payload changes", () => {
    expect(requestFingerprint({ amountCents: 500 })).not.toBe(
      requestFingerprint({ amountCents: 501 }),
    );
  });
});

describe("beginOperation / finishOperation", () => {
  it("runs the operation when the claim is new, and records its result", async () => {
    vi.mocked(claimOperation).mockResolvedValue(true);
    expect(await beginOperation(operation, request, client)).toEqual({ replayOf: null });
    await finishOperation(operation, "expense-1", client);
    expect(completeOperation).toHaveBeenCalledWith(operation, "expense-1", client);
  });

  it("replays the first result for the same id and payload", async () => {
    vi.mocked(claimOperation).mockResolvedValue(false);
    vi.mocked(findOperation).mockResolvedValue({
      request_fingerprint: requestFingerprint(request),
      result_id: "expense-1",
    });
    expect(await beginOperation(operation, request, client)).toEqual({ replayOf: "expense-1" });
  });

  it("refuses the same id with a different payload", async () => {
    // IETF idempotency-operation draft: a operation must not be reused across payloads.
    vi.mocked(claimOperation).mockResolvedValue(false);
    vi.mocked(findOperation).mockResolvedValue({
      request_fingerprint: requestFingerprint({ ...request, amountCents: 999 }),
      result_id: "expense-1",
    });
    await expect(beginOperation(operation, request, client)).rejects.toThrow(
      /already used for a different request/,
    );
  });

  it("asks for a retry while a claim has no result yet", async () => {
    vi.mocked(claimOperation).mockResolvedValue(false);
    vi.mocked(findOperation).mockResolvedValue({
      request_fingerprint: requestFingerprint(request),
      result_id: null,
    });
    await expect(beginOperation(operation, request, client)).rejects.toThrow(/still being processed/);
  });

  it("skips deduplication entirely for an empty id", async () => {
    // Only internal callers reach this: the handler requires an id.
    expect(await beginOperation({ ...operation, operationId: "" }, request, client)).toEqual({
      replayOf: null,
    });
    await finishOperation({ ...operation, operationId: "" }, "expense-1", client);
    expect(claimOperation).not.toHaveBeenCalled();
    expect(completeOperation).not.toHaveBeenCalled();
  });
});

/** A request holding a database connection that asks for another is refused outside production and logged in it. */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/common/logger", () => ({ logError: vi.fn() }));

import { logError } from "@/server/common/logger";
import { asSeparateRequest, refuseSecondConnection, SecondConnectionError, whileHoldingConnection } from "./connectionHold";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("a second connection", () => {
  it("is anybody's to take while no connection is held", () => {
    expect(() => refuseSecondConnection("a pool query")).not.toThrow();
  });

  it("is refused while one is held, however far down the awaits and timers it is asked for", async () => {
    await whileHoldingConnection(async () => {
      expect(() => refuseSecondConnection("a pool query")).toThrow(SecondConnectionError);
      await new Promise((resolve) => setTimeout(resolve, 1));
      await Promise.resolve().then(() => {
        expect(() => refuseSecondConnection("a transaction")).toThrow(/a transaction asked for a second database connection/);
      });
    });
  });

  it("is logged, not refused, in production, so a path no test reached keeps working", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await whileHoldingConnection(async () => {
      expect(() => refuseSecondConnection("a pool query")).not.toThrow();
    });

    expect(logError).toHaveBeenCalledWith(expect.any(SecondConnectionError), { scope: "db-second-connection" });
  });

  it("is fine for a separate request a test plays from inside the first", async () => {
    await whileHoldingConnection(async () => {
      await asSeparateRequest(async () => {
        expect(() => refuseSecondConnection("a transaction")).not.toThrow();
      });
    });
  });
});

/** Unit tests for telling a changed statement from other failed reads. */

import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { isStatementChanged } from "./statementChanged";

describe("isStatementChanged", () => {
  it("recognises the refusal of a page whose statement changed", () => {
    expect(isStatementChanged(new ConnectError("this statement changed", Code.FailedPrecondition))).toBe(true);
  });

  it("leaves every other failure to be retried and shown", () => {
    expect(isStatementChanged(new ConnectError("bad cursor", Code.InvalidArgument))).toBe(false);
    expect(isStatementChanged(new ConnectError("offline", Code.Unavailable))).toBe(false);
    expect(isStatementChanged(new Error("network"))).toBe(false);
    expect(isStatementChanged(undefined)).toBe(false);
  });
});

/** A dropped connection is told apart from anything the server actually said. */

import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { isNetworkFailure } from "./networkFailure";

describe("isNetworkFailure", () => {
  it("recognises a fetch that could not be made", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("recognises it wrapped by the transport", () => {
    expect(isNetworkFailure(ConnectError.from(new TypeError("Network request failed")))).toBe(true);
  });

  it("does not mistake something the server said for a dropped connection", () => {
    expect(isNetworkFailure(new ConnectError("that request is still being processed", Code.Unavailable))).toBe(false);
    expect(isNetworkFailure(new ConnectError("too large", Code.InvalidArgument))).toBe(false);
  });

  it("does not mistake an ordinary error for one", () => {
    expect(isNetworkFailure(new Error("boom"))).toBe(false);
  });
});

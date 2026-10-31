/** Unit tests for the session-transport request header. */

import { describe, expect, it } from "vitest";
import { SESSION_TRANSPORT_HEADER } from "@haalkhata/shared/auth/sessionRenewal";
import { wantsBearerToken } from "./credentials";

describe("wantsBearerToken", () => {
  it("is true only for a client that announces bearer transport", () => {
    // L-03: a browser never gets bearer material in a body; only the mobile
    // transport, which sets this header on every request, does.
    expect(wantsBearerToken(new Headers({ [SESSION_TRANSPORT_HEADER]: "bearer" }))).toBe(true);
    expect(wantsBearerToken(new Headers())).toBe(false);
    expect(wantsBearerToken(new Headers({ [SESSION_TRANSPORT_HEADER]: "cookie" }))).toBe(false);
    expect(wantsBearerToken(new Headers({ cookie: "__Host-hk_token=abc" }))).toBe(false);
  });
});

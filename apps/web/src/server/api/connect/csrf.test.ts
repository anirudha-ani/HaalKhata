/** Regression tests for consistent authentication and CSRF credential parsing. */

import { describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";
import { SESSION_COOKIE } from "./connect.constants";
import { tokenFromHeaders } from "./credentials";
import { csrfGuard } from "./csrf";

/** Builds the response methods used by the CSRF rejection path. */
function responseStub(): NextApiResponse {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as NextApiResponse;
}

describe("csrfGuard credential parsing", () => {
  it("does not exempt a malformed bearer header that authentication would ignore", () => {
    const cookieToken = "valid-cookie-token";
    const request = {
      method: "POST",
      headers: {
        authorization: "Bearer\tattacker-value",
        cookie: `${SESSION_COOKIE}=${cookieToken}`,
        host: "app.example.com",
        origin: "https://attacker.example",
      },
    } as NextApiRequest;
    const response = responseStub();

    expect(tokenFromHeaders(new Headers(request.headers as Record<string, string>))).toBe(cookieToken);
    expect(csrfGuard(request, response)).toBe(false);
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("exempts the same canonical bearer syntax authentication consumes", () => {
    const bearerToken = "valid-bearer-token";
    const request = {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearerToken}`,
        cookie: `${SESSION_COOKIE}=cookie-token`,
        host: "app.example.com",
        origin: "https://attacker.example",
      },
    } as NextApiRequest;

    expect(tokenFromHeaders(new Headers(request.headers as Record<string, string>))).toBe(bearerToken);
    expect(csrfGuard(request, responseStub())).toBe(true);
  });
});

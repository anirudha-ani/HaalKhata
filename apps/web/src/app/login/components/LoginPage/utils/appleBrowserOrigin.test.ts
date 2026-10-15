/** Prevents a local Apple redirect from losing the verifier held by the initiating tab. */

import { expect, it } from "vitest";
import { assertAppleBrowserOrigin } from "./appleBrowserOrigin";

it("accepts sign-in opened on the registered development origin", () => {
  const authorization = "https://appleid.apple.com/auth/authorize?redirect_uri=https%3A%2F%2Fdev.example.com%2Fapi%2Fauth%2Fapple%2Fcallback";
  expect(() => assertAppleBrowserOrigin(authorization, "https://dev.example.com")).not.toThrow();
});

it("stops localhost from handing its proof to a different callback origin", () => {
  const authorization = "https://appleid.apple.com/auth/authorize?redirect_uri=https%3A%2F%2Fdev.example.com%2Fapi%2Fauth%2Fapple%2Fcallback";
  expect(() => assertAppleBrowserOrigin(authorization, "http://localhost:3000"))
    .toThrow("Open https://dev.example.com/login");
});

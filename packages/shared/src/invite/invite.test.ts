/** An invite's link leads back to the server that minted it. */

import { describe, expect, it } from "vitest";
import { inviteUrl } from "./invite";

describe("inviteUrl", () => {
  it("uses the instance it is given", () => {
    expect(inviteUrl("token-1", "https://khata.example.com")).toBe("https://khata.example.com/join/token-1");
  });

  it("keeps a development address's port", () => {
    expect(inviteUrl("token-1", "http://192.168.1.5:3000")).toBe("http://192.168.1.5:3000/join/token-1");
  });
});

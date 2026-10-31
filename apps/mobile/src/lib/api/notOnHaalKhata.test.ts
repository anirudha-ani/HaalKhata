/** Only the refusal for a typed contact nobody has turns into the invite-link offer. */

import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { isNotOnHaalKhata } from "./notOnHaalKhata";

const TYPED_EMAIL = { email: "rifat@example.com", phone: "" };
const TYPED_PHONE = { email: "", phone: "+8801712345678" };
const NOTHING_TYPED = { email: "", phone: "" };

describe("isNotOnHaalKhata", () => {
  it("offers the link when a typed email or phone matches nobody", () => {
    const refusal = new ConnectError("they're not on HaalKhata yet", Code.FailedPrecondition);
    expect(isNotOnHaalKhata(refusal, TYPED_EMAIL)).toBe(true);
    expect(isNotOnHaalKhata(refusal, TYPED_PHONE)).toBe(true);
  });

  it("leaves a refusal about picked people to the ordinary error line", () => {
    // A Deleted member picked from a stale list is refused the same way.
    const refusal = new ConnectError("Deleted member can't be added to a group", Code.FailedPrecondition);
    expect(isNotOnHaalKhata(refusal, NOTHING_TYPED)).toBe(false);
  });

  it("shows every other failure as an error", () => {
    expect(isNotOnHaalKhata(new ConnectError("bad email", Code.InvalidArgument), TYPED_EMAIL)).toBe(false);
    expect(isNotOnHaalKhata(new ConnectError("slow down", Code.ResourceExhausted), TYPED_EMAIL)).toBe(false);
    expect(isNotOnHaalKhata(new Error("offline"), TYPED_EMAIL)).toBe(false);
  });
});

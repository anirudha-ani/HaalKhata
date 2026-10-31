/** A failure is only read as "not saved" when the server really said so, and an attempt waits for its answer. */

import { Code, ConnectError } from "@connectrpc/connect";
import { afterEach, describe, expect, it } from "vitest";
import {
  forgetAllSettleAttempts,
  forgetSettleAttempt,
  isSettleAttemptTooOld,
  readSettleFailure,
  rememberSettleAttempt,
  SETTLE_ATTEMPT_LIFETIME_MS,
  settleAttemptFor,
} from "./settleAttempt";

const attempt = { request: { operationId: "first" }, amountLabel: "$20.00", startedAt: 1000 };

afterEach(() => forgetAllSettleAttempts());

describe("reading a failure", () => {
  it.each([Code.InvalidArgument, Code.FailedPrecondition, Code.NotFound, Code.PermissionDenied, Code.OutOfRange])(
    "takes the server's refusal %i to mean nothing was saved",
    (code) => {
      expect(readSettleFailure(new ConnectError("refused", code))).toBe("notRecorded");
    },
  );

  it.each([Code.Unavailable, Code.DeadlineExceeded, Code.Internal, Code.Unknown, Code.Aborted, Code.Canceled])(
    "does not know from failure %i, which a lost reply looks like",
    (code) => {
      expect(readSettleFailure(new ConnectError("no answer", code))).toBe("unknown");
    },
  );

  it("does not take a rate limit on a repeat as an answer about the first attempt", () => {
    expect(readSettleFailure(new ConnectError("slow down", Code.ResourceExhausted))).toBe("unknown");
  });

  it("does not take a sign-in problem as an answer either", () => {
    expect(readSettleFailure(new ConnectError("expired", Code.Unauthenticated))).toBe("unknown");
  });

  it("does not know from something that is no server answer at all", () => {
    expect(readSettleFailure(new TypeError("Failed to fetch"))).toBe("unknown");
  });

  it("reads the same id with different contents as a sign an earlier attempt was saved", () => {
    expect(readSettleFailure(new ConnectError("used", Code.AlreadyExists))).toBe("mayHaveLanded");
  });
});

describe("keeping an attempt", () => {
  it("keeps it exactly, for that person alone", () => {
    rememberSettleAttempt("sara", attempt);

    expect(settleAttemptFor("sara")).toBe(attempt);
    expect(settleAttemptFor("tomas")).toBeNull();
  });

  it("lets it go once it has an answer", () => {
    rememberSettleAttempt("sara", attempt);

    forgetSettleAttempt("sara");

    expect(settleAttemptFor("sara")).toBeNull();
  });

  it("lets everything go with the account", () => {
    rememberSettleAttempt("sara", attempt);
    rememberSettleAttempt("tomas", attempt);

    forgetAllSettleAttempts();

    expect(settleAttemptFor("sara")).toBeNull();
    expect(settleAttemptFor("tomas")).toBeNull();
  });

  it("stops trusting a repeat before the server forgets the operation", () => {
    expect(isSettleAttemptTooOld(attempt, 1000 + SETTLE_ATTEMPT_LIFETIME_MS - 1)).toBe(false);
    expect(isSettleAttemptTooOld(attempt, 1000 + SETTLE_ATTEMPT_LIFETIME_MS)).toBe(true);
  });

  it("gives up on a repeat earlier than the server's day", () => {
    expect(SETTLE_ATTEMPT_LIFETIME_MS).toBeLessThan(24 * 60 * 60 * 1000);
  });
});

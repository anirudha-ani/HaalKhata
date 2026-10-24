/** Tests for which confirmation question stays open after an action on the queue succeeds. */

import { describe, expect, it } from "vitest";
import { questionAfterSuccess } from "./questionAfterSuccess";

const DELETE_ON_FIRST_CARD = { reportId: "report-first", action: "remove" as const };

describe("questionAfterSuccess", () => {
  it("closes the question that led to the action", () => {
    expect(questionAfterSuccess(DELETE_ON_FIRST_CARD, { reportId: "report-first", action: "remove" })).toBeNull();
  });

  it("keeps a question open on another card when an action there succeeds", () => {
    expect(questionAfterSuccess(DELETE_ON_FIRST_CARD, { reportId: "report-second", action: "dismiss" })).toBe(
      DELETE_ON_FIRST_CARD,
    );
  });

  it("keeps a question open on the same card when a different action there succeeds", () => {
    expect(questionAfterSuccess(DELETE_ON_FIRST_CARD, { reportId: "report-first", action: "dismiss" })).toBe(
      DELETE_ON_FIRST_CARD,
    );
  });

  it("leaves nothing open when nothing was", () => {
    expect(questionAfterSuccess(null, { reportId: "report-first", action: "dismiss" })).toBeNull();
  });
});

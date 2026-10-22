/** Tests for building one push message from one bell row. */

import { describe, expect, it } from "vitest";
import { PUSH_BODY_MAX_LENGTH, PUSH_PAYLOAD_MAX_BYTES, PUSH_TITLE_MAX_LENGTH } from "@/server/push/push.constants";
import { buildPushMessage, fitText, maskPhoneNumbers, pushThreadId, type PushContent } from "./pushMessage";

const TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]";

/**
 * A bell row with sensible defaults.
 *
 * @param overrides - Fields to change.
 * @returns The content.
 */
function content(overrides: Partial<PushContent> = {}): PushContent {
  return {
    notificationId: "11111111-2222-4333-8444-555555555555",
    type: "expense_added",
    title: 'Ani added "Dinner"',
    body: "Goa trip",
    link: "/expenses/exp-1",
    actorId: "user-ani",
    expenseGroupId: "grp-goa",
    ...overrides,
  };
}

describe("fitText", () => {
  it("leaves short text alone and trims it", () => {
    expect(fitText("  Dinner  ", 10)).toBe("Dinner");
  });

  it("cuts long text with an ellipsis inside the limit", () => {
    const fitted = fitText("a".repeat(50), 10);
    expect([...fitted]).toHaveLength(10);
    expect(fitted.endsWith("…")).toBe(true);
  });

  it("never splits an emoji", () => {
    const fitted = fitText("🍕".repeat(20), 5);
    expect(fitted).toBe("🍕🍕🍕🍕…");
  });
});

describe("maskPhoneNumbers", () => {
  it("keeps only the last two digits of a number", () => {
    expect(maskPhoneNumbers("Your number +8801712345678 now points to a different account")).toBe(
      "Your number •••78 now points to a different account",
    );
  });

  it("handles spaces and dashes inside a number", () => {
    expect(maskPhoneNumbers("+1 415-555-0142 is now on your profile")).toBe("•••42 is now on your profile");
  });

  it("leaves amounts and short numbers alone", () => {
    expect(maskPhoneNumbers("You owe ৳600 for 3 people")).toBe("You owe ৳600 for 3 people");
  });
});

describe("pushThreadId", () => {
  it("threads an expense by its group", () => {
    expect(pushThreadId(content())).toBe("group-grp-goa");
  });

  it("threads a group link by the group", () => {
    expect(pushThreadId(content({ expenseGroupId: null, link: "/groups/grp-2", type: "member_added" }))).toBe("group-grp-2");
  });

  it("threads a friend link by the person", () => {
    expect(pushThreadId(content({ expenseGroupId: null, link: "/friends/user-b", type: "settlement" }))).toBe("person-user-b");
  });

  it("threads a one-off expense by who did it", () => {
    expect(pushThreadId(content({ expenseGroupId: null }))).toBe("person-user-ani");
  });

  it("falls back to the category without an actor", () => {
    expect(pushThreadId(content({ expenseGroupId: null, link: "/account", actorId: null, type: "phone_transferred" }))).toBe("always");
  });
});

describe("buildPushMessage", () => {
  it("carries the bell row's words, the badge and only the routing data", () => {
    const message = buildPushMessage(content(), "user-b", TOKEN, 4);
    expect(message).toMatchObject({
      to: TOKEN,
      title: 'Ani added "Dinner"',
      body: "Goa trip",
      badge: 4,
      sound: "default",
      categoryId: "expenses",
      threadId: "group-grp-goa",
      priority: "high",
    });
    expect(message.data).toEqual({
      notificationId: "11111111-2222-4333-8444-555555555555",
      link: "/expenses/exp-1",
      recipientId: "user-b",
    });
  });

  it("uses the notification id as the collapse id, so a repeat replaces the first", () => {
    expect(buildPushMessage(content(), "user-b", TOKEN, 0).collapseId).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("masks a phone number only in the security alert", () => {
    const alert = buildPushMessage(
      content({ type: "phone_transferred", title: "Your number +8801712345678 now points to a different account", body: "", link: "/account" }),
      "user-b",
      TOKEN,
      1,
    );
    expect(alert.title).toBe("Your number •••78 now points to a different account");
    expect(alert.categoryId).toBe("always");
    const reminder = buildPushMessage(content({ type: "reminder", title: "Call +8801712345678" }), "user-b", TOKEN, 1);
    expect(reminder.title).toBe("Call +8801712345678");
  });

  it("cuts title and body to their limits", () => {
    const message = buildPushMessage(content({ title: "t".repeat(500), body: "b".repeat(500) }), "user-b", TOKEN, 0);
    expect([...message.title]).toHaveLength(PUSH_TITLE_MAX_LENGTH);
    expect([...message.body]).toHaveLength(PUSH_BODY_MAX_LENGTH);
  });

  it("stays within the service's byte limit with four-byte characters", () => {
    const message = buildPushMessage(
      content({ title: "𝔸".repeat(500), body: "𝔹".repeat(500), link: `/expenses/${"x".repeat(120)}` }),
      "user-b",
      TOKEN,
      0,
    );
    expect(Buffer.byteLength(JSON.stringify(message))).toBeLessThanOrEqual(PUSH_PAYLOAD_MAX_BYTES);
  });

  it("never sends a negative badge", () => {
    expect(buildPushMessage(content(), "user-b", TOKEN, -3).badge).toBe(0);
  });
});

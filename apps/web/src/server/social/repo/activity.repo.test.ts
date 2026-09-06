/** Regression tests for activity keyset cursor validation. */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/common/db", () => ({
  execute: vi.fn(),
  newId: vi.fn(),
  query: vi.fn(),
}));

import { query } from "@/server/common/db";
import { listActivityPage } from "./activity.repo";

const VIEWER_ID = "user-viewer";
const ACTIVITY_ID = "7d953b7f-5ace-4a43-9ef7-12c3ce440ca3";
const CREATED_AT = "2026-08-28T08:15:30.123Z";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(query).mockResolvedValue([]);
});

describe("activity cursor validation", () => {
  it("drops malformed timestamp and id values before building SQL parameters", async () => {
    await listActivityPage(
      { userId: VIEWER_ID },
      { limit: 25, cursor: "not-a-time|not-an-id", month: "" },
    );

    const [statement, values] = vi.mocked(query).mock.calls[0];
    expect(statement).not.toContain("(created_at, id) <");
    expect(values).toEqual([VIEWER_ID, 26]);
  });

  it("binds a canonical cursor produced by the activity repository", async () => {
    await listActivityPage(
      { userId: VIEWER_ID },
      { limit: 25, cursor: `${CREATED_AT}|${ACTIVITY_ID}`, month: "" },
    );

    const [statement, values] = vi.mocked(query).mock.calls[0];
    expect(statement).toContain("(created_at, id) < ($2, $3)");
    expect(values).toEqual([VIEWER_ID, CREATED_AT, ACTIVITY_ID, 26]);
  });

  it("rejects calendar-looking timestamps that are not real dates", async () => {
    await listActivityPage(
      { userId: VIEWER_ID },
      { limit: 25, cursor: `2026-99-99T08:15:30.123Z|${ACTIVITY_ID}`, month: "" },
    );

    const [statement, values] = vi.mocked(query).mock.calls[0];
    expect(statement).not.toContain("(created_at, id) <");
    expect(values).toEqual([VIEWER_ID, 26]);
  });
});

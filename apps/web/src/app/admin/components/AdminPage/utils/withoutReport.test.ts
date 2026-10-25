/** Tests for taking a handled entry out of the cached report queue. */

import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  ReportedContentSchema,
  ReportQueueSchema,
  SuspendedAccountSchema,
} from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";
import { withoutReport } from "./withoutReport";

const QUEUE = create(ReportQueueSchema, {
  generatedAt: "2026-10-25T12:00:00Z",
  reports: [
    create(ReportedContentSchema, { reportId: "report-first", targetKind: "comment" }),
    create(ReportedContentSchema, { reportId: "report-second", targetKind: "expense" }),
  ],
  reportsTruncated: true,
  suspended: [create(SuspendedAccountSchema, { name: "Someone", reportId: "report-old" })],
});

describe("withoutReport", () => {
  it("drops the handled entry and keeps the rest of the queue as read", () => {
    const after = withoutReport(QUEUE, "report-first");

    expect(after?.reports.map((entry) => entry.reportId)).toEqual(["report-second"]);
    expect(after?.reportsTruncated).toBe(true);
    expect(after?.suspended).toBe(QUEUE.suspended);
    expect(QUEUE.reports).toHaveLength(2);
  });

  it("changes nothing when the entry is already gone", () => {
    expect(withoutReport(QUEUE, "report-elsewhere")?.reports).toEqual(QUEUE.reports);
  });

  it("leaves a queue that has not loaded alone", () => {
    expect(withoutReport(undefined, "report-first")).toBeUndefined();
  });
});

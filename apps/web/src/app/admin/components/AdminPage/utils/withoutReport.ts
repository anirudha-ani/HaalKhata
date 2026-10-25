/** Takes one handled entry out of a cached report queue. */

import type { ReportQueue } from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";

/**
 * The queue as it stands once a dismissal or removal through one report
 * succeeded: that entry is gone, since the action closed every open report
 * about its content, and everything else is as it was read.
 *
 * @param queue - The cached queue, if one has loaded.
 * @param reportId - The report the action went through.
 * @returns The queue without that entry, or undefined when none has loaded.
 */
export function withoutReport(queue: ReportQueue | undefined, reportId: string): ReportQueue | undefined {
  if (!queue) return queue;
  return { ...queue, reports: queue.reports.filter((entry) => entry.reportId !== reportId) };
}

/**
 * Moderation business logic: the report queue and the four actions the
 * operator can take on it. The same decisions as ops/moderate.sh, with two
 * differences that only make sense on a page: an action on one report
 * settles every open report about the same content, and a suspension that
 * would change nothing is refused out loud instead of applied to a row that
 * no longer stands for anyone.
 *
 * Nothing here checks who is asking. The handler establishes the admin
 * session before calling in, and these functions answer whoever calls them.
 */

import type { PoolClient } from "pg";
import { invalid, notFound, UsecaseError } from "@/server/common/errors";
import { logEvent } from "@/server/common/logger";
import { snapshot, transaction } from "@/server/common/db/db";
import {
  REMOVED_CONTENT,
  REPORT_ID_PATTERN,
  REPORT_QUEUE_LIMIT,
  SUSPENDED_LIST_LIMIT,
} from "@/server/adminmoderation/adminmoderation.constants";
import { rankReasons } from "@/server/adminmoderation/domain/reasonCounts";
import {
  blankExpenseText,
  closeReportsAbout,
  deleteComment,
  listReportedContent,
  listSuspendedAccounts,
  lockAccountStanding,
  lockReport,
  renameGroup,
  replaceQuotations,
  resetProfile,
  resumeAccount,
  suspendAccount,
  type LockedReportRow,
} from "@/server/adminmoderation/repo/moderation.repo";

/** What the operator did, for the one log line each action writes. */
type ModerationAction = "dismiss" | "remove" | "suspend" | "resume";

/**
 * Reads the queue and the suspended accounts at one instant, so a report
 * the list shows as waiting and an author it shows as suspended describe the
 * same moment.
 *
 * @returns The queue in proto shape.
 */
export async function listReports() {
  const generatedAt = new Date();
  return snapshot(async (client) => {
    const reported = await listReportedContent(REPORT_QUEUE_LIMIT, client);
    const suspended = await listSuspendedAccounts(SUSPENDED_LIST_LIMIT, client);
    return {
      generatedAt: generatedAt.toISOString(),
      reports: reported.map((resultRow) => ({
        reportId: resultRow.report_id,
        targetKind: resultRow.target_kind,
        reportCount: resultRow.report_count,
        reasons: rankReasons(resultRow.reasons),
        firstReportedAt: resultRow.first_reported_at,
        lastReportedAt: resultRow.last_reported_at,
        text: resultRow.text ?? "",
        notes: resultRow.notes ?? "",
        itemNames: resultRow.item_names ?? [],
        author: {
          name: resultRow.author_name ?? "",
          suspended: resultRow.author_suspended,
          active: resultRow.author_active,
          openReportCount: resultRow.author_open_report_count,
        },
      })),
      reportsTruncated: (reported[0]?.total_count ?? 0) > reported.length,
      suspended: suspended.map((resultRow) => ({
        name: resultRow.name,
        suspendedAt: resultRow.suspended_at,
        reportId: resultRow.report_id ?? "",
      })),
    };
  });
}

/**
 * Refuses a value that cannot be a report id before it reaches SQL.
 *
 * @param reportId - What the page sent.
 * @throws UsecaseError "invalid_argument" for anything but a UUID.
 */
function assertReportId(reportId: string): void {
  if (!REPORT_ID_PATTERN.test(reportId)) invalid("that is not a report id");
}

/**
 * Locks a report that is still waiting for a decision.
 *
 * @param reportId - The report the operator acted through.
 * @param client - The action's transaction.
 * @returns The locked report.
 * @throws UsecaseError "not_found" for no such report, "failed_precondition"
 *   for one already dismissed or removed (a second tab, a double click).
 */
async function lockOpenReport(reportId: string, client: PoolClient): Promise<LockedReportRow> {
  const report = await lockReport(reportId, client);
  if (!report) notFound("report not found");
  if (report.status !== "open") {
    throw new UsecaseError(
      "failed_precondition",
      "this report was already handled, so nothing was changed",
    );
  }
  return report;
}

/**
 * Writes the one line that says an action happened: what, through which
 * report, on what kind of content. Never the words, a name or an address.
 *
 * @param action - What was done.
 * @param reportId - The report it was done through.
 * @param targetKind - The kind of content the report is about.
 */
function logAction(action: ModerationAction, reportId: string, targetKind: string): void {
  logEvent("info", "admin moderation action", { action, reportId, targetKind });
}

/**
 * Closes every open report about the reported content and leaves the
 * content as it is.
 *
 * @param reportId - The report the operator acted through.
 */
export async function dismissReport(reportId: string): Promise<void> {
  assertReportId(reportId);
  const targetKind = await transaction(async (client) => {
    const report = await lockOpenReport(reportId, client);
    await closeReportsAbout({ kind: report.target_kind, id: report.target_id }, "dismissed", client);
    return report.target_kind;
  });
  logAction("dismiss", reportId, targetKind);
}

/**
 * Removes the reported content the way `moderate.sh remove` does, then
 * closes every open report about it. One transaction: the content, the feed
 * lines and notifications quoting it, and the reports change together or
 * not at all.
 *
 * A comment is deleted. An expense keeps its amount, payers and splits and
 * loses its words. A group keeps its members and ledger under a neutral
 * name. A person keeps their account, balances and sign-in under a neutral
 * name, without their picture.
 *
 * @param reportId - The report the operator acted through.
 */
export async function removeReportedContent(reportId: string): Promise<void> {
  assertReportId(reportId);
  const targetKind = await transaction(async (client) => {
    const report = await lockOpenReport(reportId, client);
    const targetId = report.target_id;
    if (report.target_kind === "comment") {
      await deleteComment(targetId, client);
    } else if (report.target_kind === "expense") {
      await blankExpenseText(
        targetId,
        { description: REMOVED_CONTENT.expenseDescription, itemName: REMOVED_CONTENT.itemName },
        client,
      );
    } else if (report.target_kind === "group") {
      await renameGroup(targetId, REMOVED_CONTENT.groupName, client);
    } else if (report.target_kind === "user") {
      await resetProfile(targetId, REMOVED_CONTENT.profileName, client);
    } else {
      // The table's CHECK allows only the four kinds above.
      invalid(`cannot remove content of kind ${report.target_kind}`);
    }
    await replaceQuotations(
      { authorId: report.reported_user_id, targetId },
      REMOVED_CONTENT.quotation,
      client,
    );
    await closeReportsAbout({ kind: report.target_kind, id: targetId }, "removed", client);
    return report.target_kind;
  });
  logAction("remove", reportId, targetKind);
}

/**
 * Locks the report and the account it names, for a suspension or its end.
 * The report may be open or closed: the suspended list resumes through
 * reports that were settled long ago.
 *
 * @param reportId - The report the operator acted through.
 * @param client - The action's transaction.
 * @returns The report and the author's standing.
 * @throws UsecaseError "not_found" for no such report;
 *   "failed_precondition" when the report names no account that exists.
 */
async function lockAuthor(reportId: string, client: PoolClient) {
  const report = await lockReport(reportId, client);
  if (!report) notFound("report not found");
  const standing = report.reported_user_id
    ? await lockAccountStanding(report.reported_user_id, client)
    : undefined;
  if (!report.reported_user_id || !standing) {
    throw new UsecaseError("failed_precondition", "the account this report is about no longer exists");
  }
  return { report, authorId: report.reported_user_id, standing };
}

/**
 * Suspends the author of the reported content and ends every session they
 * hold. Suspending someone already suspended changes nothing and is not an
 * error: the page asked for the state the account is already in.
 *
 * @param reportId - The report the operator acted through.
 * @throws UsecaseError "failed_precondition" when the account was merged
 *   into another: the row the report names no longer signs anyone in, so
 *   suspending it would look like it worked and stop nobody.
 */
export async function suspendAuthor(reportId: string): Promise<void> {
  assertReportId(reportId);
  const targetKind = await transaction(async (client) => {
    const { report, authorId, standing } = await lockAuthor(reportId, client);
    if (!standing.active) {
      throw new UsecaseError(
        "failed_precondition",
        "this account was merged into another, so there is no one to suspend through this report",
      );
    }
    if (!standing.suspended) await suspendAccount(authorId, client);
    return report.target_kind;
  });
  logAction("suspend", reportId, targetKind);
}

/**
 * Lifts the suspension of the author of the reported content. Resuming
 * someone who is not suspended changes nothing and is not an error.
 *
 * @param reportId - The report the operator acted through.
 */
export async function resumeAuthor(reportId: string): Promise<void> {
  assertReportId(reportId);
  const targetKind = await transaction(async (client) => {
    const { report, authorId, standing } = await lockAuthor(reportId, client);
    if (standing.suspended) await resumeAccount(authorId, client);
    return report.target_kind;
  });
  logAction("resume", reportId, targetKind);
}

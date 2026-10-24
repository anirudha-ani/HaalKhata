/** Usage overview business logic: product-wide counts for the operator, read at one instant. */

import { snapshot } from "@/server/common/db/db";
import {
  MONTHLY_ACTIVE_DAYS,
  USAGE_USER_LIMIT,
  WEEKLY_ACTIVE_DAYS,
} from "@/server/adminanalytics/adminanalytics.constants";
import { rankSplitTypes } from "@/server/adminanalytics/domain/splitTypes";
import {
  findUsageTotals,
  listExpenseSplitTypeCounts,
  listUserUsage,
} from "@/server/adminanalytics/repo/usage.repo";

/**
 * Builds the usage overview.
 *
 * The caller must already have established an admin session; this function
 * makes no authorization decision of its own and answers whoever calls it.
 *
 * Read inside one snapshot, one statement at a time on its client, so the
 * totals at the top of the page and the list underneath describe the same
 * moment: without it, a sign-up between two statements would show a total
 * that the list below it does not add up to.
 *
 * @returns The overview in proto shape: totals, split types, and one row
 *   of counts per person who has signed in. The trend is GetUsageTrend's.
 */
export async function getUsageOverview() {
  const generatedAt = new Date();

  return snapshot(async (client) => {
    const totals = await findUsageTotals(
      { week: WEEKLY_ACTIVE_DAYS, month: MONTHLY_ACTIVE_DAYS },
      client,
    );
    const splitTypes = await listExpenseSplitTypeCounts(client);
    const users = await listUserUsage(USAGE_USER_LIMIT, client);

    return {
      generatedAt: generatedAt.toISOString(),
      totals: {
        registeredUserCount: totals.registered_user_count,
        invitedUserCount: totals.invited_user_count,
        weeklyActiveUserCount: totals.weekly_active_user_count,
        monthlyActiveUserCount: totals.monthly_active_user_count,
        groupCount: totals.group_count,
        expenseCount: totals.expense_count,
        deletedExpenseCount: totals.deleted_expense_count,
        paymentCount: totals.payment_count,
        receiptScanCount: totals.receipt_scan_count,
        parsedReceiptScanCount: totals.parsed_receipt_scan_count,
        commentCount: totals.comment_count,
        paymentMethodCount: totals.payment_method_count,
        paymentMethodUserCount: totals.payment_method_user_count,
      },
      expensesBySplitType: splitTypes.map((splitTypeRow) => ({
        splitType: splitTypeRow.split_type,
        count: splitTypeRow.count,
      })),
      users: users.map((userRow) => ({
        name: userRow.name,
        joinedOn: userRow.joined_on,
        expensesBySplitType: rankSplitTypes(userRow.expenses_by_split_type),
        paymentCount: userRow.payment_count,
        receiptScanCount: userRow.receipt_scan_count,
      })),
      usersTruncated: totals.registered_user_count > users.length,
    };
  });
}

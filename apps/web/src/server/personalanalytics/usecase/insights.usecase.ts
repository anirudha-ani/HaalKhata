/** Personal insights business logic: one person's own ledger, counted over a window of months. */

import { snapshot } from "@/server/common/db";
import { UsecaseError } from "@/server/common/errors";
import { toInt32Cents } from "@/server/common/money";
import {
  assembleCurrencyInsights,
  countExpensesByMonth,
} from "@/server/personalanalytics/domain/currencyInsights";
import { insightWindow } from "@/server/personalanalytics/domain/insightWindow";
import {
  TOP_COMPANION_LIMIT,
  TOP_GROUP_LIMIT,
} from "@/server/personalanalytics/personalanalytics.constants";
import {
  findJourney,
  listCategorySpending,
  listCompanions,
  listGroupActivity,
  listMonthlySpending,
  listSplitTypeCounts,
  sumPayments,
} from "@/server/personalanalytics/repo/insights.repo";

/**
 * Builds the caller's insights: lifetime figures plus everything their
 * ledger holds for a trailing window of calendar months.
 *
 * There is no authorization decision to make beyond "who is asking": every
 * statement is keyed on the caller's own id, so the answer is about them
 * and cannot be about anyone else.
 *
 * The statements run inside one snapshot, one at a time on its client. The
 * figures are shown side by side (a total above the months that add up to
 * it), and an expense committing between two statements would otherwise
 * show a total its own chart disagrees with.
 *
 * @param userId - Id of the authenticated caller.
 * @param options - Window size in months and the caller's current "YYYY-MM".
 * @returns The response in proto shape.
 * @throws UsecaseError "unauthenticated" when the account row is gone.
 * @throws UsecaseError "failed_precondition" when a total exceeds what the
 *   wire can carry.
 */
export async function getInsights(
  userId: string,
  options: { months: number; localMonth: string },
) {
  const window = insightWindow(new Date(), options.months, options.localMonth);

  return snapshot(async (client) => {
    const journey = await findJourney(userId, client);
    if (!journey) throw new UsecaseError("unauthenticated", "account no longer exists");

    const monthlyRows = await listMonthlySpending(userId, window, client);
    const categoryRows = await listCategorySpending(userId, window, client);
    const splitTypeRows = await listSplitTypeCounts(userId, window, client);
    const groupRows = await listGroupActivity(userId, window, TOP_GROUP_LIMIT, client);
    const companionRows = await listCompanions(userId, window, TOP_COMPANION_LIMIT, client);
    const paymentRows = await sumPayments(userId, window.startInstant, client);

    const monthly = monthlyRows.map((monthRow) => ({
      currency: monthRow.currency,
      month: monthRow.month,
      shareCents: Number(monthRow.share_cents),
      paidCents: Number(monthRow.paid_cents),
      expenseCount: monthRow.expense_count,
    }));
    const monthlyExpenseCounts = countExpensesByMonth(window.months, monthly);
    const currencies = assembleCurrencyInsights(
      window.months,
      journey.default_currency,
      monthly,
      categoryRows.map((categoryRow) => ({
        currency: categoryRow.currency,
        category: categoryRow.category,
        shareCents: Number(categoryRow.share_cents),
        expenseCount: categoryRow.expense_count,
      })),
      paymentRows.map((paymentRow) => ({
        currency: paymentRow.currency,
        paidCents: Number(paymentRow.paid_cents),
        receivedCents: Number(paymentRow.received_cents),
      })),
    );

    return {
      journey: {
        memberSince: journey.member_since,
        firstExpenseDate: journey.first_expense_date ?? "",
        expenseCount: journey.expense_count,
        paymentCount: journey.payment_count,
        groupCount: journey.group_count,
        friendCount: journey.friend_count,
        receiptScanCount: journey.receipt_scan_count,
      },
      months: window.months,
      expenseCount: monthlyExpenseCounts.reduce((total, count) => total + count, 0),
      monthlyExpenseCounts,
      // Every stored amount fits an int32, but a sum of them need not; each
      // total is checked on its way out rather than crashing the encoder.
      currencies: currencies.map((block) => ({
        currency: block.currency,
        shareCents: toInt32Cents(block.shareCents, "your spending"),
        paidCents: toInt32Cents(block.paidCents, "what you paid"),
        monthlyShareCents: block.monthlyShareCents.map((cents) =>
          toInt32Cents(cents, "your spending"),
        ),
        categories: block.categories.map((category) => ({
          category: category.category,
          shareCents: toInt32Cents(category.shareCents, "your spending"),
          expenseCount: category.expenseCount,
        })),
        settledOutCents: toInt32Cents(block.settledOutCents, "what you paid back"),
        settledInCents: toInt32Cents(block.settledInCents, "what you were paid back"),
        expenseCount: block.expenseCount,
      })),
      splitTypes: splitTypeRows.map((splitTypeRow) => ({
        splitType: splitTypeRow.split_type,
        expenseCount: splitTypeRow.expense_count,
      })),
      companions: companionRows.map((companionRow) => ({
        userId: companionRow.id,
        name: companionRow.name,
        avatarColor: companionRow.avatar_color,
        avatarUrl: companionRow.avatar_url ?? "",
        sharedExpenseCount: companionRow.shared_expense_count,
      })),
      groups: groupRows.map((groupRow) => ({
        groupId: groupRow.group_id ?? "",
        name: groupRow.name ?? "",
        type: groupRow.type ?? "",
        expenseCount: groupRow.expense_count,
      })),
    };
  });
}

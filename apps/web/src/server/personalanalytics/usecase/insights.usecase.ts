/** Personal insights business logic: one person's own ledger, counted over a window of months. */

import { snapshot } from "@/server/common/db";
import { UsecaseError } from "@/server/common/errors";
import { toInt32Cents } from "@/server/common/money";
import { assembleCurrencyInsights } from "@/server/personalanalytics/domain/currencyInsights";
import { insightWindow } from "@/server/personalanalytics/domain/insightWindow";
import {
  categorySpendingOf,
  monthlySpendingOf,
  placeActivityOf,
  splitTypeUseOf,
} from "@/server/personalanalytics/domain/spendingBreakdown";
import {
  TOP_COMPANION_LIMIT,
  TOP_GROUP_LIMIT,
} from "@/server/personalanalytics/personalanalytics.constants";
import {
  findJourney,
  listCompanions,
  listSpendingBreakdown,
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
 * Four statements, whatever the size of the caller's history: lifetime
 * figures, the window's spending grouped once and regrouped here, the
 * people they split with, and their payments. They run one at a time inside
 * one snapshot, on its client. The figures are shown side by side (a total
 * above the months that add up to it), and an expense committing between
 * two statements would otherwise show a total its own chart disagrees with.
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

    const breakdownRows = await listSpendingBreakdown(userId, window, client);
    const companionRows = await listCompanions(userId, window, TOP_COMPANION_LIMIT, client);
    const paymentRows = await sumPayments(userId, window.startInstant, client);

    const cells = breakdownRows.map((breakdownRow) => ({
      currency: breakdownRow.currency,
      month: breakdownRow.month,
      category: breakdownRow.category,
      splitType: breakdownRow.split_type,
      groupId: breakdownRow.group_id ?? "",
      groupName: breakdownRow.group_name ?? "",
      groupType: breakdownRow.group_type ?? "",
      isMember: breakdownRow.is_member,
      shareCents: Number(breakdownRow.share_cents),
      paidCents: Number(breakdownRow.paid_cents),
      expenseCount: breakdownRow.expense_count,
    }));
    const currencies = assembleCurrencyInsights(
      window.months,
      journey.default_currency,
      monthlySpendingOf(cells),
      categorySpendingOf(cells),
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
        })),
        settledOutCents: toInt32Cents(block.settledOutCents, "what you paid back"),
        settledInCents: toInt32Cents(block.settledInCents, "what you were paid back"),
      })),
      splitTypes: splitTypeUseOf(cells),
      companions: companionRows.map((companionRow) => ({
        userId: companionRow.id,
        name: companionRow.name,
        avatarColor: companionRow.avatar_color,
        avatarUrl: companionRow.avatar_url ?? "",
        sharedExpenseCount: companionRow.shared_expense_count,
      })),
      groups: placeActivityOf(cells, TOP_GROUP_LIMIT),
    };
  });
}

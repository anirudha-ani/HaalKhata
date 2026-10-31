/**
 * The API's money-bearing messages as the apps see them: with plain numbers
 * where the wire carries 64-bit integers. Clients made by `plainClient`
 * return these, so a screen, hook or shared helper that names one of these
 * messages imports it from here rather than from @haalkhata/protogen, whose
 * types hold bigint.
 */

import type * as common from "@haalkhata/protogen/common/v1/common_pb";
import type * as expense from "@haalkhata/protogen/expense/v1/expense_pb";
import type * as group from "@haalkhata/protogen/group/v1/group_pb";
import type * as personalanalytics from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import type * as receipt from "@haalkhata/protogen/receipt/v1/receipt_pb";
import type * as social from "@haalkhata/protogen/social/v1/social_pb";
import type { PlainNumbers } from "./wireNumbers";

/** One amount in one currency. */
export type CurrencyAmount = PlainNumbers<common.CurrencyAmount>;
/** A pairwise debt: `fromUserId` owes `toUserId`. */
export type Debt = PlainNumbers<common.Debt>;
/** A person's net position in a group. */
export type NetBalance = PlainNumbers<common.NetBalance>;
/** The caller's overall position against one person. */
export type CounterpartyBalance = PlainNumbers<common.CounterpartyBalance>;

/** An expense with its payers, splits and items. */
export type Expense = PlainNumbers<expense.Expense>;
/** One payer of an expense. */
export type Payer = PlainNumbers<expense.Payer>;
/** One person's share of an expense. */
export type Split = PlainNumbers<expense.Split>;
/** One line of an itemized expense. */
export type ExpenseItem = PlainNumbers<expense.ExpenseItem>;
/** An expense as sent to be created or saved. */
export type CreateExpenseRequest = PlainNumbers<expense.CreateExpenseRequest>;
/** A page of expenses. */
export type ListExpensesResponse = PlainNumbers<expense.ListExpensesResponse>;
/** One expense with its comments and history. */
export type GetExpenseResponse = PlainNumbers<expense.GetExpenseResponse>;
/** A recorded payment. */
export type Settlement = PlainNumbers<expense.Settlement>;
/** One line of the statement with a friend. */
export type FriendLedgerEntry = PlainNumbers<expense.FriendLedgerEntry>;
/** Everything shown on a friend's page. */
export type FriendLedgerResponse = PlainNumbers<expense.FriendLedgerResponse>;
/** One balance a settle button can settle. */
export type SettlePosition = PlainNumbers<expense.SettlePosition>;
/** The caller's balances with everyone. */
export type OverallBalancesResponse = PlainNumbers<expense.OverallBalancesResponse>;
/** What the caller owes and is owed in one currency. */
export type CurrencyTotals = PlainNumbers<expense.CurrencyTotals>;
/** A group's balances, debts and simplified debts. */
export type BalancesResponse = PlainNumbers<expense.BalancesResponse>;

/** A group in the caller's list, with their balance in it. */
export type GroupSummary = PlainNumbers<group.GroupSummary>;

/** One currency's spending insights. */
export type CurrencyInsights = PlainNumbers<personalanalytics.CurrencyInsights>;
/** The caller's insights. */
export type GetInsightsResponse = PlainNumbers<personalanalytics.GetInsightsResponse>;

/** A receipt read from a photo. */
export type ParsedReceipt = PlainNumbers<receipt.ParsedReceipt>;

/** One row of the activity feed. */
export type ActivityEvent = PlainNumbers<social.ActivityEvent>;

/** Thin ExpenseService Connect handlers; logic lives in the expense/balance usecases. */

import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import type { ExpenseService } from "@haalkhata/protogen/expense/v1/expense_pb";
import * as expenses from "@/server/expense/usecase/expense.usecase";
import * as balances from "@/server/expense/usecase/balance.usecase";
import { requireUser, runUsecase } from "@/server/api/connect/context";
import { requireRateLimitedUser, RPC_RATE_LIMITS } from "@/server/api/connect/rpcRateLimit";
import { assertOperationId } from "@/server/common/operations";

/**
 * ConnectRPC implementation of ExpenseService. Every method only resolves the
 * authenticated user and delegates to a usecase via `runUsecase`, which maps
 * UsecaseError codes onto ConnectError codes.
 */
export const expenseHandler: ServiceImpl<typeof ExpenseService> = {
  /** Every external create names its attempt, so a retry cannot store two. */
  async createExpense(request, context) {
    return runUsecase(async () => {
      assertOperationId(request.operationId);
      return expenses.createExpense(
        await requireRateLimitedUser(context, "create-expense", RPC_RATE_LIMITS.createExpense),
        request,
      );
    }, context);
  },

  async updateExpense(request, context) {
    if (!request.expense) {
      throw new ConnectError("expense payload is required", Code.InvalidArgument);
    }
    return runUsecase(
      async () => expenses.updateExpense(await requireUser(context), request.expenseId, request.expense!),
      context,
    );
  },

  async listExpenses(request, context) {
    return runUsecase(
      async () =>
        expenses.listExpenses(await requireUser(context), {
          groupId: request.groupId || undefined,
          withUserId: request.withUserId || undefined,
        }),
      context,
    );
  },

  async getExpense(request, context) {
    return runUsecase(async () => expenses.getExpense(await requireUser(context), request.expenseId), context);
  },

  async deleteExpense(request, context) {
    await runUsecase(async () => expenses.deleteExpense(await requireUser(context), request.expenseId), context);
    return {};
  },

  /** Removes a mistaken payment; either person on it may. */
  async deleteSettlement(request, context) {
    await runUsecase(
      async () => expenses.deleteSettlement(await requireUser(context), request.settlementId),
      context,
    );
    return {};
  },

  async addComment(request, context) {
    return runUsecase(
      async () => expenses.addComment(await requireUser(context), request.expenseId, request.body),
      context,
    );
  },

  /** Every external recording names its attempt, so a retry cannot store two. */
  async recordSettlement(request, context) {
    return runUsecase(async () => {
      assertOperationId(request.operationId);
      return expenses.recordSettlement(await requireUser(context), request);
    }, context);
  },

  async getGroupBalances(request, context) {
    return runUsecase(async () => balances.getGroupBalances(await requireUser(context), request.groupId), context);
  },

  async getOverallBalances(_request, context) {
    return runUsecase(
      async () =>
        balances.getOverallBalances(
          await requireRateLimitedUser(
            context,
            "get-overall-balances",
            RPC_RATE_LIMITS.getOverallBalances,
          ),
        ),
      context,
    );
  },

  async getFriendLedger(request, context) {
    return runUsecase(
      async () => balances.getFriendLedger(await requireUser(context), request.userId),
      context,
    );
  },
};

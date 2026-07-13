/** Thin ExpenseService Connect handlers; logic lives in the expense/balance usecases. */

import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import type { ExpenseService } from "@haalkhata/protogen/expense/v1/expense_pb";
import * as expenses from "@/server/expense/usecase/expense.usecase";
import * as balances from "@/server/expense/usecase/balance.usecase";
import { requireUser, runUsecase } from "@/server/api/connect/context";

/**
 * ConnectRPC implementation of ExpenseService. Every method only resolves the
 * authenticated user and delegates to a usecase via `runUsecase`, which maps
 * UsecaseError codes onto ConnectError codes.
 */
export const expenseHandler: ServiceImpl<typeof ExpenseService> = {
  async createExpense(request, context) {
    return runUsecase(() => expenses.createExpense(requireUser(context), request));
  },

  async updateExpense(request, context) {
    if (!request.expense) {
      throw new ConnectError("expense payload is required", Code.InvalidArgument);
    }
    return runUsecase(() =>
      expenses.updateExpense(requireUser(context), request.expenseId, request.expense!),
    );
  },

  async listExpenses(request, context) {
    return runUsecase(() =>
      expenses.listExpenses(requireUser(context), {
        groupId: request.groupId || undefined,
        withUserId: request.withUserId || undefined,
      }),
    );
  },

  async getExpense(request, context) {
    return runUsecase(() => expenses.getExpense(requireUser(context), request.expenseId));
  },

  async deleteExpense(request, context) {
    await runUsecase(() => expenses.deleteExpense(requireUser(context), request.expenseId));
    return {};
  },

  async addComment(request, context) {
    return runUsecase(() =>
      expenses.addComment(requireUser(context), request.expenseId, request.body),
    );
  },

  async recordSettlement(request, context) {
    return runUsecase(() => expenses.recordSettlement(requireUser(context), request));
  },

  async getGroupBalances(request, context) {
    return runUsecase(() => balances.getGroupBalances(requireUser(context), request.groupId));
  },

  async getOverallBalances(_request, context) {
    return runUsecase(() => balances.getOverallBalances(requireUser(context)));
  },
};

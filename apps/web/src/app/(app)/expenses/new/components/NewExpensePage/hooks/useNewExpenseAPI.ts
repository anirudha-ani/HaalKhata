"use client";
/** Expense form queries (me, groups, friends, expense being edited) + create/update/parse mutations. */

import { RECEIPT_TIMEOUT_MS } from "@haalkhata/shared/api/timeouts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { MessageInitShape } from "@bufbuild/protobuf";
import type { PlainNumbers } from "@haalkhata/shared/api/wireNumbers";
import type { CreateExpenseRequestSchema } from "@haalkhata/protogen/expense/v1/expense_pb";
import {
  authClient,
  expenseClient,
  groupClient,
  receiptClient,
  socialClient,
} from "@/lib/api/connect";
import { GroupStatus } from "@haalkhata/shared/group/status";
import { groupsByStatus } from "@haalkhata/shared/group/archiving";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { COMMENT_PAGE_SIZE } from "@haalkhata/shared/api/paging";

/** Plain-object init shape of a CreateExpenseRequest proto message, with its money as plain numbers. */
export type CreateExpenseInput = PlainNumbers<MessageInitShape<typeof CreateExpenseRequestSchema>>;

/**
 * Loads everything the expense form needs (current user, groups, friends,
 * and — when editing — the expense itself) and exposes the create/update
 * mutations, both of which invalidate every money-related query on success.
 *
 * @param editExpenseId - Id of the expense being edited, or "" when creating.
 * @returns `me`, `groups`, `friends`, `editing` (the getExpense response when
 *   editing), a combined `isLoading` flag, and the `create`/`update` mutations.
 */
export function useNewExpenseAPI(editExpenseId: string) {
  const queryClient = useQueryClient();

  const currentUserQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authClient.getMe({}),
  });
  const groupsQuery = useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupClient.listGroups({}),
  });
  const friendsQuery = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });
  const editingQuery = useQuery({
    queryKey: queryKeys.expense(editExpenseId),
    // The same request as the detail page's: they share this cache entry.
    queryFn: () => expenseClient.getExpense({ expenseId: editExpenseId, commentLimit: COMMENT_PAGE_SIZE }),
    enabled: editExpenseId !== "",
  });

  /** Invalidates every balance/expense-affecting query after a write. */
  const invalidateMoney = () => {
    for (const moneyQueryKey of MONEY_KEYS) {
      queryClient.invalidateQueries({ queryKey: moneyQueryKey });
    }
  };

  const create = useMutation({
    mutationFn: (input: CreateExpenseInput) => expenseClient.createExpense(input),
    onSuccess: invalidateMoney,
  });
  const update = useMutation({
    mutationFn: (input: { expenseId: string; expense: CreateExpenseInput; preserveSplitType?: boolean }) =>
      expenseClient.updateExpense(input),
    onSuccess: invalidateMoney,
  });

  // A scan answers this form only. Leaving the form, or starting another
  // scan, hangs up on the one in flight: the server stops it and gives its
  // lane to someone else rather than finishing a reply nobody will read.
  const scanInFlight = useRef<AbortController | null>(null);
  useEffect(() => () => scanInFlight.current?.abort(), []);
  /** Hangs up on any scan in flight and returns the controller for a new one. */
  const startScan = () => {
    scanInFlight.current?.abort();
    scanInFlight.current = new AbortController();
    return scanInFlight.current;
  };

  /**
   * Sends a receipt photo to the AI parser and yields the structured draft.
   * Lives here rather than on its own route because a scan is a way of
   * filling in this form, not a different kind of expense.
   */
  const parse = useMutation({
    mutationFn: async (input: { file: File; consentVersion: string; currency: string }) => {
      const scan = startScan();
      const bytes = new Uint8Array(await input.file.arrayBuffer());
      return receiptClient.parseReceipt(
        { image: bytes, mediaType: input.file.type, consentVersion: input.consentVersion, currency: input.currency },
        { timeoutMs: RECEIPT_TIMEOUT_MS, signal: scan.signal },
      );
    },
  });

  return {
    me: currentUserQuery.data,
    groups: groupsByStatus(groupsQuery.data?.groups ?? []),
    archivedGroups: groupsByStatus(groupsQuery.data?.groups ?? [], GroupStatus.ARCHIVED),
    friends: friendsQuery.data?.friends ?? [],
    editing: editingQuery.data,
    isLoading:
      currentUserQuery.isLoading ||
      groupsQuery.isLoading ||
      friendsQuery.isLoading ||
      (editExpenseId !== "" && editingQuery.isLoading),
    create,
    update,
    parse,
  };
}

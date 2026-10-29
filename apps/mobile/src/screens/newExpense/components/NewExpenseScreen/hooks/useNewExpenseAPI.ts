/** Expense form queries (me, groups, friends, expense being edited) + create/update/parse mutations. */

import { RECEIPT_TIMEOUT_MS } from "@haalkhata/shared/api/timeouts";
import { COMMENT_PAGE_SIZE } from "@haalkhata/shared/api/paging";
import type { MessageInitShape } from "@bufbuild/protobuf";
import type { PlainNumbers } from "@haalkhata/shared/api/wireNumbers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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
import { base64ToBytes } from "@/lib/encoding/encoding";
import { offerPushExplainer } from "@/lib/push/pushStore";

/** Plain-object init shape of a CreateExpenseRequest proto message, with its money as plain numbers. */
export type CreateExpenseInput = PlainNumbers<MessageInitShape<typeof CreateExpenseRequestSchema>>;

/** A photo picked for scanning: its base64 payload and media type. */
export interface ReceiptPhotoInput {
  /** Base64-encoded image bytes from the picker. */
  base64: string;
  /** MIME type of the image (e.g. "image/jpeg"). */
  mediaType: string;
}

/**
 * Loads everything the expense form needs (current user, groups, friends,
 * and — when editing — the expense itself) and exposes the create/update
 * mutations, both of which invalidate every money-related query on success.
 *
 * @param editExpenseId - Id of the expense being edited, or "" when creating.
 * @returns `me`, `groups`, `friends`, `editing` (the getExpense response when
 *   editing), a combined `isLoading` flag, the `create`/`update` mutations,
 *   and the `parse` mutation that reads a receipt photo into a draft.
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
    // The same request as the expense's own screen, which shares this key.
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
    onSuccess: () => {
      invalidateMoney();
      // The first moment a notification would matter: someone else may now
      // add, change or settle this with you.
      void offerPushExplainer();
    },
  });
  const update = useMutation({
    mutationFn: (input: { expenseId: string; expense: CreateExpenseInput; preserveSplitType?: boolean }) =>
      expenseClient.updateExpense(input),
    onSuccess: invalidateMoney,
  });

  // A scan answers this screen only. Leaving it, or starting another scan,
  // hangs up on the one in flight: the server stops it and gives its lane
  // to someone else rather than finishing a reply nobody will read.
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
    mutationFn: (photo: ReceiptPhotoInput & { consentVersion: string; currency: string }) =>
      receiptClient.parseReceipt({
        image: base64ToBytes(photo.base64),
        mediaType: photo.mediaType,
        consentVersion: photo.consentVersion,
        currency: photo.currency,
      }, { timeoutMs: RECEIPT_TIMEOUT_MS, signal: startScan().signal }),
  });

  return {
    me: currentUserQuery.data,
    groups: groupsByStatus(groupsQuery.data?.groups ?? []),
    archivedGroups: groupsByStatus(groupsQuery.data?.groups ?? [], GroupStatus.ARCHIVED),
    friends: friendsQuery.data?.friends ?? [],
    editing: editingQuery.data,
    loadError: (!currentUserQuery.data && currentUserQuery.error) || (!groupsQuery.data && groupsQuery.error) ||
      (!friendsQuery.data && friendsQuery.error) || (editExpenseId !== "" && !editingQuery.data && editingQuery.error),
    retry: () => { void currentUserQuery.refetch(); void groupsQuery.refetch(); void friendsQuery.refetch(); if (editExpenseId) void editingQuery.refetch(); },
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

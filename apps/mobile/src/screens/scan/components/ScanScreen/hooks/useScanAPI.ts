/** TanStack Query bindings for the scan flow: parse-receipt and create-expense mutations plus me/groups/friends. */

import type { MessageInitShape } from "@bufbuild/protobuf";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateExpenseRequestSchema } from "@haalkhata/protogen/expense/v1/expense_pb";
import {
  authClient,
  expenseClient,
  groupClient,
  receiptClient,
  socialClient,
} from "@/lib/api/connect";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { base64ToBytes } from "@/lib/encoding/encoding";

/** A photo picked for scanning: its base64 payload and media type. */
export interface ReceiptPhotoInput {
  /** Base64-encoded image bytes from the picker. */
  base64: string;
  /** MIME type of the image (e.g. "image/jpeg"). */
  mediaType: string;
}

/**
 * Wraps every server call the scan screen makes: the signed-in user, groups
 * and friends (for the "who is this with?" picker), the AI parse-receipt
 * mutation, and the create-expense mutation (which invalidates all
 * money-related caches on success).
 *
 * @returns An object with `me`, `groups`, `friends`, an `isLoading` flag for
 *   the picker data, the `parse` mutation (takes a {@link ReceiptPhotoInput}),
 *   and the `create` mutation (takes a CreateExpenseRequest payload).
 */
export function useScanAPI() {
  const queryClient = useQueryClient();

  const currentUser = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });
  const groups = useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupClient.listGroups({}),
  });
  const friends = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => socialClient.listFriends({}),
  });

  /** Sends the receipt photo bytes to the AI parser and yields the structured draft. */
  const parse = useMutation({
    mutationFn: (photo: ReceiptPhotoInput) =>
      receiptClient.parseReceipt({
        image: base64ToBytes(photo.base64),
        mediaType: photo.mediaType,
      }),
  });

  /** Creates the itemized expense; on success invalidates every money-related query. */
  const create = useMutation({
    mutationFn: (input: MessageInitShape<typeof CreateExpenseRequestSchema>) =>
      expenseClient.createExpense(input),
    onSuccess: () => {
      for (const moneyKey of MONEY_KEYS) queryClient.invalidateQueries({ queryKey: moneyKey });
    },
  });

  return {
    me: currentUser.data,
    groups: groups.data?.groups ?? [],
    friends: friends.data?.friends ?? [],
    isLoading: currentUser.isLoading || groups.isLoading,
    parse,
    create,
  };
}

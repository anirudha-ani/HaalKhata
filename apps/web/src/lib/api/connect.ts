/** Typed Connect clients for the browser. Import from client components only. */

import { API_TIMEOUT_MS } from "@haalkhata/shared/api/timeouts";
import { SafetyService } from "@haalkhata/protogen/safety/v1/safety_pb";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { ConnectError } from "@connectrpc/connect";
import { AuthService } from "@haalkhata/protogen/auth/v1/auth_pb";
import { GroupService } from "@haalkhata/protogen/group/v1/group_pb";
import { ExpenseService } from "@haalkhata/protogen/expense/v1/expense_pb";
import { ReceiptService } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { SocialService } from "@haalkhata/protogen/social/v1/social_pb";
import { PaymentMethodService } from "@haalkhata/protogen/payment/v1/payment_pb";

/** Connect-Web transport that routes every RPC through the app's `/api/connect` proxy. */
export const transport = createConnectTransport({ baseUrl: "/api/connect", defaultTimeoutMs: API_TIMEOUT_MS });

/** Typed client for authentication RPCs (sign up, log in, session, log out). */
export const authClient = createClient(AuthService, transport);
/** Typed client for group management RPCs (create, list, members, balances). */
export const groupClient = createClient(GroupService, transport);
/** Typed client for expense and settlement RPCs. */
export const expenseClient = createClient(ExpenseService, transport);
/** Typed client for receipt scanning/upload RPCs. */
export const receiptClient = createClient(ReceiptService, transport);
/** Typed client for social RPCs (friends, activity, notifications). */
export const socialClient = createClient(SocialService, transport);
/** Typed client for the caller's own payment methods (list, add, edit, remove, star). */
export const paymentClient = createClient(PaymentMethodService, transport);

/**
 * Extracts a human-readable message from a ConnectError (or any thrown value).
 *
 * @param error - The unknown value caught from a failed RPC call.
 * @returns The error message with the leading Connect status-code prefix stripped,
 *   or a generic fallback when the value is not an `Error`.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ConnectError) {
    // ConnectError.rawMessage is the human text without the [code] prefix;
    // .message is '[invalid_argument] ...' which we don't want to show users.
    return error.rawMessage || "something went wrong";
  }
  if (error instanceof Error) return error.message || "something went wrong";
  return "something went wrong";
}

/** Typed client for private reports and caller-owned blocks. */
export const safetyClient = createClient(SafetyService, transport);

/**
 * Typed Connect clients for the mobile app. Same contract as the web client
 * (`/api/connect` on the HaalKhata server), but authenticated with the bearer
 * token from {@link ../api/session} instead of a cookie. Each client is
 * wrapped by plainClient, so money arrives and leaves as plain numbers.
 */

import { API_TIMEOUT_MS } from "@haalkhata/shared/api/timeouts";
import { plainClient } from "@haalkhata/shared/api/plainClient";
import { SafetyService } from "@haalkhata/protogen/safety/v1/safety_pb";
import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "@haalkhata/protogen/auth/v1/auth_pb";
import { ExpenseService } from "@haalkhata/protogen/expense/v1/expense_pb";
import { GroupService } from "@haalkhata/protogen/group/v1/group_pb";
import { PaymentMethodService } from "@haalkhata/protogen/payment/v1/payment_pb";
import { PushService } from "@haalkhata/protogen/push/v1/push_pb";
import { ReceiptService } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { PersonalAnalyticsService } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { SocialService } from "@haalkhata/protogen/social/v1/social_pb";
import { resolveApiBaseUrl } from "./api.constants";
import { authorization } from "./authorization";

/**
 * React Native's fetch cannot reliably send typed-array bodies. The transport
 * speaks proto JSON, so the request bytes are UTF-8 — decode them back to a
 * string, which native fetch handles natively.
 *
 * @param input - The request URL or Request object.
 * @param init - The fetch options whose body may be a Uint8Array.
 * @returns The fetch response promise.
 */
const nativeFetch: typeof fetch = (input, init) => {
  if (init && init.body instanceof Uint8Array) {
    return fetch(input, { ...init, body: new TextDecoder().decode(init.body) });
  }
  return fetch(input, init);
};

/** Connect transport for every RPC: JSON wire format, bearer auth, server URL from the environment. */
export const transport = createConnectTransport({
  baseUrl: resolveApiBaseUrl(),
  defaultTimeoutMs: API_TIMEOUT_MS,
  interceptors: [authorization],
  fetch: nativeFetch,
});

/** Typed client for authentication RPCs (sign up, log in, session, log out). */
export const authClient = plainClient(AuthService, createClient(AuthService, transport));
/** Typed client for group management RPCs (create, list, members, balances). */
export const groupClient = plainClient(GroupService, createClient(GroupService, transport));
/** Typed client for expense and settlement RPCs. */
export const expenseClient = plainClient(ExpenseService, createClient(ExpenseService, transport));
/** Typed client for receipt scanning/upload RPCs. */
export const receiptClient = plainClient(ReceiptService, createClient(ReceiptService, transport));
/** Typed client for social RPCs (friends, activity, notifications). */
export const socialClient = plainClient(SocialService, createClient(SocialService, transport));
/** Typed client for the caller's own payment methods (list, add, edit, remove, star). */
export const paymentClient = plainClient(PaymentMethodService, createClient(PaymentMethodService, transport));
/** Typed client for the phones that receive push notifications and which kinds they receive. */
export const pushClient = plainClient(PushService, createClient(PushService, transport));
/** Typed client for the signed-in person's own insights. */
export const personalAnalyticsClient = plainClient(PersonalAnalyticsService, createClient(PersonalAnalyticsService, transport));

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
export const safetyClient = plainClient(SafetyService, createClient(SafetyService, transport));

/**
 * Whether the server refused what was sent (a wrong code, a bad field)
 * rather than failing to answer. A field whose value was refused is cleared,
 * since sending it again can only be refused again; after an outage it is
 * kept, so trying again needs nothing retyped.
 *
 * @param error - The unknown value caught from a failed RPC call.
 * @returns True for an InvalidArgument refusal.
 */
export function isRefusal(error: unknown): boolean {
  return error instanceof ConnectError && error.code === Code.InvalidArgument;
}

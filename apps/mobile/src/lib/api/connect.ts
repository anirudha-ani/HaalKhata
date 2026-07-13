/**
 * Typed Connect clients for the mobile app. Same contract as the web client
 * (`/api/connect` on the HaalKhata server), but authenticated with the bearer
 * token from {@link ../api/session} instead of a cookie.
 */

import { Code, ConnectError, createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "@haalkhata/protogen/auth/v1/auth_pb";
import { ExpenseService } from "@haalkhata/protogen/expense/v1/expense_pb";
import { GroupService } from "@haalkhata/protogen/group/v1/group_pb";
import { ReceiptService } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { SocialService } from "@haalkhata/protogen/social/v1/social_pb";
import { resolveApiBaseUrl } from "./api.constants";
import { clearSession, sessionToken } from "./session";

/**
 * Attaches the bearer token to every RPC and signs the app out locally when
 * the server reports the token is no longer valid (revoked or expired), so
 * the auth gate returns the user to the login screen.
 */
const authorization: Interceptor = (next) => async (request) => {
  const token = sessionToken();
  if (token) request.header.set("Authorization", `Bearer ${token}`);
  try {
    return await next(request);
  } catch (error) {
    if (token && error instanceof ConnectError && error.code === Code.Unauthenticated) {
      await clearSession();
    }
    throw error;
  }
};

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
  interceptors: [authorization],
  fetch: nativeFetch,
});

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

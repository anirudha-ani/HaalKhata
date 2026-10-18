/** Expo Push Service over its documented HTTPS API; the only code that talks to Expo. */

import { readSecret } from "@/server/common/secrets/secrets";
import {
  EXPO_PUSH_RECEIPTS_URL,
  EXPO_PUSH_SEND_URL,
  EXPO_REQUEST_TIMEOUT_MS,
} from "@/server/push/push.constants";
import {
  PushTransportError,
  type PushMessage,
  type PushProvider,
  type PushReceipt,
  type PushTicket,
} from "@/server/push/usecase/provider/pushTypes";

/** Expo's response envelope: `data` on success, `errors` on a request-level failure. */
interface ExpoEnvelope<Payload> {
  data?: Payload;
  errors?: { code?: string; message?: string }[];
}

/**
 * Posts one JSON request to Expo and unwraps its envelope.
 *
 * Retryable: 429, 5xx, a timeout or a network failure, and an authentication
 * refusal (a configuration fault that an operator fixes without the rows
 * being lost). Not retryable: any other 4xx, which would fail the same way
 * again.
 *
 * @param endpoint - Endpoint.
 * @param payload - Request body.
 * @returns The envelope's data.
 * @throws PushTransportError for a failure of the request as a whole.
 */
async function postToExpo<Payload>(endpoint: string, payload: unknown): Promise<Payload> {
  const accessToken = readSecret("EXPO_ACCESS_TOKEN");
  const headers: Record<string, string> = {
    accept: "application/json",
    "accept-encoding": "gzip, deflate",
    "content-type": "application/json",
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(EXPO_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PushTransportError(`expo request failed: ${error instanceof Error ? error.message : String(error)}`, true);
  }
  let envelope: ExpoEnvelope<Payload> | undefined;
  try {
    envelope = (await response.json()) as ExpoEnvelope<Payload>;
  } catch {
    envelope = undefined;
  }
  const errorCode = envelope?.errors?.[0]?.code ?? "";
  if (!response.ok || !envelope || envelope.data === undefined) {
    const retryable =
      response.status === 429 || response.status >= 500 || response.status === 401 || errorCode === "UNAUTHORIZED";
    throw new PushTransportError(
      `expo answered ${response.status}${errorCode ? ` ${errorCode}` : ""}: ${envelope?.errors?.[0]?.message ?? "no data"}`,
      retryable,
    );
  }
  return envelope.data;
}

/**
 * Builds the Expo provider for this process.
 *
 * @returns A provider that sends through Expo.
 */
export function expoPushProvider(): PushProvider {
  return {
    name: "expo",
    async send(messages: PushMessage[]): Promise<PushTicket[]> {
      if (messages.length === 0) return [];
      const tickets = await postToExpo<PushTicket[]>(EXPO_PUSH_SEND_URL, messages);
      if (!Array.isArray(tickets) || tickets.length !== messages.length) {
        throw new PushTransportError("expo returned a ticket list that does not match the request", true);
      }
      return tickets;
    },
    async receipts(ticketIds: string[]): Promise<Record<string, PushReceipt>> {
      if (ticketIds.length === 0) return {};
      return postToExpo<Record<string, PushReceipt>>(EXPO_PUSH_RECEIPTS_URL, { ids: ticketIds });
    },
  };
}

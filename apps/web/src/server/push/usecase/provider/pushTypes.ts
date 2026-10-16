/** Shapes exchanged with a push delivery service, and its request-level failure. */

/** One message to one phone, in Expo's documented field names. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Read by the app on tap; never carries money, tokens or payment details. */
  data: { notificationId: string; link: string; recipientId: string };
  sound: "default";
  /** The recipient's unread count, so the icon badge matches the bell. */
  badge: number;
  /** Groups related pushes in Notification Center. */
  threadId: string;
  /** A repeat with the same id replaces the shown push instead of adding one. */
  collapseId: string;
  /** Registered by the app with a placeholder for hidden previews. */
  categoryId: string;
  ttl: number;
  priority: "high";
}

/** The service's immediate answer for one message. */
export type PushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

/** The service's later answer for one accepted message. */
export type PushReceipt =
  | { status: "ok" }
  | { status: "error"; message: string; details?: { error?: string } };

/** A failure of a whole request, as opposed to one message in it. */
export class PushTransportError extends Error {
  /**
   * @param message - What went wrong, for the log.
   * @param retryable - Whether sending the same request later may succeed.
   */
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PushTransportError";
  }
}

/** What the dispatcher needs from a delivery service. */
export interface PushProvider {
  /** Provider name, for logs. */
  readonly name: string;
  /**
   * Sends up to one batch of messages.
   * @param messages - At most one batch.
   * @returns One ticket per message, in order.
   * @throws PushTransportError when the request as a whole failed.
   */
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  /**
   * Reads receipts for accepted messages.
   * @param ticketIds - At most one receipt batch.
   * @returns Receipts by ticket id; a missing id is not ready yet.
   * @throws PushTransportError when the request as a whole failed.
   */
  receipts(ticketIds: string[]): Promise<Record<string, PushReceipt>>;
}

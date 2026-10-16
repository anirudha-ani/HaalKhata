/** Push domain constants: delivery service endpoints, batch sizes, timing and limits. */

/** Expo's send endpoint; one request carries at most {@link PUSH_BATCH_SIZE} messages. */
export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";

/** Expo's receipt endpoint; one request carries at most {@link PUSH_RECEIPT_BATCH_SIZE} ids. */
export const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** One Expo request may not wait longer than this; a hung call must not stall the worker. */
export const EXPO_REQUEST_TIMEOUT_MS = 10_000;

/** Expo's documented maximum messages per send request, and the outbox claim size. */
export const PUSH_BATCH_SIZE = 100;

/** Expo's documented maximum receipt ids per request. */
export const PUSH_RECEIPT_BATCH_SIZE = 1_000;

/**
 * How long a claimed outbox row stays invisible to other claims. A worker that
 * dies mid-send leaves its rows to be claimed again once this lapses.
 */
export const PUSH_LEASE_SECONDS = 120;

/** Delay before each retry of a push the service could not take, by attempt number. */
export const PUSH_RETRY_DELAYS_SECONDS = [30, 120, 600, 1_800] as const;

/**
 * A push not handed over within this long is dropped: "Ani added Dinner" an
 * afternoon late is noise, and the bell already holds it.
 */
export const PUSH_MAX_AGE_SECONDS = 3_600;

/** How long the phone's push service keeps trying a phone that is off. */
export const PUSH_TIME_TO_LIVE_SECONDS = 86_400;

/** Sweep interval: retries, a NOTIFY missed during a reconnect, and the first start. */
export const PUSH_SWEEP_INTERVAL_MS = 30_000;

/** How often the worker reads delivery receipts. */
export const PUSH_RECEIPT_INTERVAL_MS = 5 * 60_000;

/** Expo's receipts are ready about this long after a send. */
export const PUSH_RECEIPT_DELAY_MINUTES = 15;

/** Expo forgets a receipt after a day; tickets older than this are deleted unread. */
export const PUSH_TICKET_MAX_AGE_HOURS = 24;

/** A phone that has not opened the app in this long is assumed gone and removed. */
export const PUSH_DEVICE_STALE_DAYS = 90;

/** At most this many phones per account; registering another evicts the one seen least recently. */
export const MAX_PUSH_DEVICES_PER_USER = 10;

/**
 * Per-pair cap: from one person to another, at most this many pushes in
 * {@link PUSH_PAIR_WINDOW_MINUTES}; the rest stay in the bell. Blunts
 * cancel-and-resend friend requests and comment floods.
 */
export const PUSH_PAIR_CAP = 10;

/** Window for {@link PUSH_PAIR_CAP}. */
export const PUSH_PAIR_WINDOW_MINUTES = 10;

/** Postgres NOTIFY channel raised when outbox rows commit. */
export const PUSH_NOTIFY_CHANNEL = "push_outbox";

/** Longest title a push shows; longer ones are cut with an ellipsis. */
export const PUSH_TITLE_MAX_LENGTH = 120;

/** Longest body a push shows. */
export const PUSH_BODY_MAX_LENGTH = 240;

/** Expo's limit on a whole message, in bytes. */
export const PUSH_PAYLOAD_MAX_BYTES = 4_096;

/** Longest delivery error kept on an outbox row. */
export const PUSH_LAST_ERROR_MAX_LENGTH = 500;

/** Shape of an Expo push token, mirrored by the push_devices CHECK. */
export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/;

/** Shape of an installation id minted by the app, mirrored by the push_devices CHECK. */
export const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** Platforms a phone may register as. */
export const PUSH_PLATFORMS = ["ios", "android"] as const;

/** Longest phone label kept, e.g. "iPhone 17 Pro Max". */
export const MAX_DEVICE_LABEL_LENGTH = 64;

/** Longest app version kept, e.g. "1.1.0". */
export const MAX_APP_VERSION_LENGTH = 32;

/** Delivery providers the server can be configured with. */
export const PUSH_PROVIDERS = ["expo", "log"] as const;

/**
 * Ticket and receipt errors after which a message is worth sending again;
 * everything else is either a dead phone (handled on its own) or a bug that a
 * resend would repeat.
 */
export const RETRYABLE_PUSH_ERRORS = ["MessageRateExceeded", "ProviderError", "ExpoError", "InvalidCredentials"] as const;

/** The error that means the phone no longer has the app: stop sending to it. */
export const DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

/** Phone-number-shaped runs in push text: an optional +, then at least seven digits with spaces or dashes between. */
export const PHONE_NUMBER_PATTERN = /\+?\d[\d\s-]{5,}\d/g;

/** Control and format characters (invisible ones) removed from a phone's label and app version. */
export const INVISIBLE_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}]/gu;

/**
 * A display field longer than its limit times this, before cleaning, is
 * refused unread: measuring first keeps a megabyte in a field from costing
 * anything.
 */
export const DISPLAY_FIELD_RAW_LENGTH_FACTOR = 4;

/** RPC deadlines shared by browser and native transports. */

/** Ordinary calls must surface a retryable network failure rather than wait indefinitely. */
export const API_TIMEOUT_MS = 30000;
/** Vision providers can take 90 seconds; allow upload/encoding and a bounded response window. */
export const RECEIPT_TIMEOUT_MS = 120000;

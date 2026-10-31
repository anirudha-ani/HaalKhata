/** Constants for idempotent financial mutations. */

/** Longest an operation id is accepted at; a UUID is 36. */
export const MAX_OPERATION_ID_LENGTH = 64;

/** Shape of an acceptable operation id: what a UUID or a random token looks like. */
export const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * How long a claim answers retries for, in hours. Published as the contract
 * the Idempotency-Key draft asks for: after this a reused id runs again,
 * whether or not the sweep has removed its row yet.
 */
export const OPERATION_RETENTION_HOURS = 24;

/** How often the background sweep removes claims past retention. */
export const OPERATION_SWEEP_INTERVAL_MS = 10 * 60_000;

/**
 * Claims removed per statement. Each batch is its own short autocommit, so
 * the sweep never holds many rows, and never for long.
 */
export const OPERATION_SWEEP_BATCH_SIZE = 500;

/** Batches per sweep at most; anything left over goes on the next one. */
export const OPERATION_SWEEP_MAX_BATCHES = 20;

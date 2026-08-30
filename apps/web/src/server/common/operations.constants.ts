/** Constants for idempotent financial mutations. */

/** Longest an operation id is accepted at; a UUID is 36. */
export const MAX_OPERATION_ID_LENGTH = 64;

/** Shape of an acceptable operation id: what a UUID or a random token looks like. */
export const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * How long a claim answers retries for, in hours. Published as the contract
 * the idempotency draft asks for: after this a reused id runs again.
 */
export const OPERATION_RETENTION_HOURS = 24;

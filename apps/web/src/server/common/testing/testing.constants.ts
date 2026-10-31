/** Constants for the throwaway databases the integration tests create. */

/** Longest database name Postgres keeps whole (NAMEDATALEN − 1). */
export const MAX_DATABASE_NAME_LENGTH = 63;

/** Random bytes appended to a test database's name, as hex. */
export const DATABASE_NAME_SUFFIX_BYTES = 4;

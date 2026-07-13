/** Database constants. */

/** Dev-default connection string, matching the compose `db` service's default
 * POSTGRES_PASSWORD (change-me in .env.example). DATABASE_URL overrides it.
 * Keep this in sync with the root .env.example POSTGRES_PASSWORD. */
export const DEFAULT_DATABASE_URL = "postgres://haalkhata:change-me@localhost:5432/haalkhata";

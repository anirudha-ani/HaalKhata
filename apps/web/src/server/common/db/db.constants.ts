/** Database constants. */

/** Dev-default connection string, matching the compose `db` service's default
 * POSTGRES_PASSWORD (change-me in .env.example). DATABASE_URL overrides it.
 * Keep this in sync with the root .env.example POSTGRES_PASSWORD. */
export const DEFAULT_DATABASE_URL = "postgres://haalkhata:change-me@localhost:5432/haalkhata";

/** Minimum production database-password length in decoded UTF-8 bytes. */
export const MIN_DATABASE_PASSWORD_BYTES = 16;

/** Common placeholder/default passwords that production must always reject. */
export const WEAK_DATABASE_PASSWORDS = new Set([
  "change-me",
  "changeme",
  "haalkhata",
  "password",
  "postgres",
]);

/** URL protocols accepted by node-postgres for PostgreSQL connections. */
export const DATABASE_URL_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

/** Hosts reached only through loopback or the bundled private Compose network. */
export const PLAINTEXT_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "db"]);

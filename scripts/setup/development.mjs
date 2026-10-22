/** Validates only settings required to start the local Compose database. */

/**
 * Reports the actionable database input before Compose prints interpolation failures.
 * @param {Record<string, string | undefined>} environment Shell overrides plus root dotenv values.
 * @returns {void} Does not change credentials or require optional identity providers.
 */
export function assertDevelopmentDatabasePassword(environment) {
  if (!environment.POSTGRES_PASSWORD?.trim()) {
    throw new Error("Set POSTGRES_PASSWORD in the Secrets section at the bottom of .env, then rerun ./dev.sh. Use your existing database password if you already have local data. Apple sign-in is optional and does not block startup.");
  }
}

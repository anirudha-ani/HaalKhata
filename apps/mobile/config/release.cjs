/** Build-time release validation, shared by Expo config and its regression tests. */

/**
 * Rejects a release that would launch without a working secure API or Google login.
 * @param {Record<string, string | undefined>} environment Build environment.
 * @returns {void}
 */
function validateReleaseEnvironment(environment) {
  if (!['preview', 'production'].includes(environment.EAS_BUILD_PROFILE)) return;
  const configuredOrigin = environment.EXPO_PUBLIC_API_URL;
  let parsedOrigin;
  try { parsedOrigin = new URL(configuredOrigin); } catch {
    throw new Error('Release builds require EXPO_PUBLIC_API_URL, an HTTPS origin.');
  }
  if (parsedOrigin.protocol !== 'https:' || parsedOrigin.username || parsedOrigin.password ||
      parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
    throw new Error('EXPO_PUBLIC_API_URL must be an HTTPS origin without credentials or a path.');
  }
  const clientVariable = environment.EAS_BUILD_PLATFORM === 'android'
    ? 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID' : 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID';
  if (!environment[clientVariable]?.endsWith('.apps.googleusercontent.com')) {
    throw new Error(`Release builds require ${clientVariable}.`);
  }
}

module.exports = { validateReleaseEnvironment };

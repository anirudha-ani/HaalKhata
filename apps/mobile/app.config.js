/** Expo configuration with fail-fast release validation and optional EAS account linkage. */

const { validateReleaseEnvironment } = require('./config/release.cjs');

/**
 * Preserves configuration written by eas init and validates cloud release inputs.
 * @param {{config: import('expo/config').ExpoConfig}} context Resolved app.json config.
 * @returns {import('expo/config').ExpoConfig} Native build configuration.
 */
module.exports = ({ config }) => {
  validateReleaseEnvironment(process.env);
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;
  return {
    ...config,
    ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
    extra: { ...config.extra, ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}) },
  };
};

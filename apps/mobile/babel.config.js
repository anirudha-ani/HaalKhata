/** Babel configuration: the Expo preset (includes expo-router support). */

module.exports = function babelConfig(api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};

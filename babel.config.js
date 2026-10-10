// Expo's default Babel setup, written out explicitly so Jest (babel-jest) uses the
// same transform as Metro. babel-preset-expo also auto-applies the Reanimated plugin.
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};

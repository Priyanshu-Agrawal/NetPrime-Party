/**
 * Deep-import a file from the @expo/config-plugins copy that `expo` itself runs
 * config plugins with. SDK 57 nests that package under expo/node_modules, so a
 * bare require("@expo/config-plugins/...") from the project no longer resolves;
 * resolving from expo's folder finds it wherever npm puts it.
 * Public API comes from `expo/config-plugins`; use this only for helpers the
 * package doesn't export (mergeContents, assignColorValue).
 */
const path = require("path");

const EXPO_DIR = path.dirname(require.resolve("expo/package.json"));

module.exports = function requireExpoConfigPluginsInternal(subpath) {
  return require(require.resolve(`@expo/config-plugins/${subpath}`, { paths: [EXPO_DIR] }));
};

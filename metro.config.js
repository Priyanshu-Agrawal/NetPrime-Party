// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// `@movie-web/providers` (stream extractor) depends on cheerio. Cheerio's default
// (ESM) build imports `node:stream`, which the Hermes/React Native runtime does
// not provide, so Metro bundling fails. Redirect the bare `cheerio` specifier to
// its Node-free **browser** build, which exposes the same `load()` API the
// scrapers use. Surgical (only affects the `cheerio` specifier).
const cheerioBrowser = path.resolve(
  __dirname,
  "node_modules/cheerio/dist/browser/index.js",
);
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "cheerio") {
    return { type: "sourceFile", filePath: cheerioBrowser };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

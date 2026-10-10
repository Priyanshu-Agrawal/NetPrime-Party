/**
 * CNG-safe iOS fixes for building on current Xcode. Survive `expo prebuild --clean`
 * via withPodfile post_install.
 *
 * 1. fmt 11.0.2 + Xcode 26 / Apple Clang 21: RN's vendored fmt treats FMT_STRING
 *    as consteval; newer Clang rejects that.
 * 2. Xcode 27 rejects any pod target whose iOS deployment target is below 15.0
 *    (SDWebImage's resource bundle still declares 9.0) — raise every pod target to
 *    the app's deployment floor (16.4 from SDK 56).
 */
const { createRunOncePlugin, withPodfile } = require("expo/config-plugins");
const { mergeContents } = require("./expoConfigPluginsInternal")("build/utils/generateCode");

const PLUGIN_NAME = "bearoom-fmt-xcode";

const POST_INSTALL = [
  "    # fmt 11.0.2 + Xcode 26 Clang: FMT_STRING is not a constant expression.",
  "    installer.pods_project.targets.each do |target|",
  "      if target.name == 'fmt'",
  "        target.build_configurations.each do |config|",
  "          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'",
  "        end",
  "      end",
  "    end",
  "    fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')",
  "    if File.exist?(fmt_base)",
  "      content = File.read(fmt_base)",
  "      unless content.include?('Bearoom Xcode 26 fmt workaround')",
  "        patched = content.gsub(",
  "          /^(#elif defined\\(__cpp_consteval\\)\\n#\\s+define FMT_USE_CONSTEVAL) 1/,",
  "          \"// Bearoom Xcode 26 fmt workaround: disable consteval\\n\\\\1 0\"",
  "        )",
  "        if patched != content",
  "          File.chmod(0644, fmt_base)",
  "          File.write(fmt_base, patched)",
  "        end",
  "      end",
  "    end",
  "    # Xcode 27: pod targets below iOS 15.0 fail to build (SDWebImage's bundle says 9.0).",
  "    installer.pods_project.targets.each do |target|",
  "      target.build_configurations.each do |config|",
  "        dt = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
  "        if dt.nil? || Gem::Version.new(dt) < Gem::Version.new('15.1')",
  "          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'",
  "        end",
  "      end",
  "    end",
].join("\n");

const DEPLOYMENT_FLOOR = "16.4"; // the SDK 56+ app minimum
// SDK 53 passes `podfile_properties['apple.ccacheEnabled'] == 'true'`; SDK 54+ calls
// `ccache_enabled?(podfile_properties)`. Either way the block lands after the
// react_native_post_install(...) call's closing paren.
const CCACHE_ANCHOR =
  /:ccache_enabled => (?:podfile_properties\['apple\.ccacheEnabled'\] == 'true'|ccache_enabled\?\(podfile_properties\)),/;

function postInstall(floor) {
  return POST_INSTALL.replace(/'15\.1'/g, `'${floor}'`);
}

function addXcodeFixesToPodfile(contents, floor = DEPLOYMENT_FLOOR) {
  if (!CCACHE_ANCHOR.test(contents)) {
    throw new Error(`${PLUGIN_NAME}: anchor not found in Podfile (react_native_post_install :ccache_enabled)`);
  }
  return mergeContents({
    tag: `${PLUGIN_NAME}-post-install`,
    src: contents,
    newSrc: postInstall(floor),
    anchor: CCACHE_ANCHOR,
    offset: 2,
    comment: "#",
  }).contents;
}

const withFmtXcodeFix = (config) =>
  withPodfile(config, (cfg) => {
    cfg.modResults.contents = addXcodeFixesToPodfile(cfg.modResults.contents);
    return cfg;
  });

module.exports = createRunOncePlugin(withFmtXcodeFix, PLUGIN_NAME);
module.exports.addXcodeFixesToPodfile = addXcodeFixesToPodfile;
module.exports.DEPLOYMENT_FLOOR = DEPLOYMENT_FLOOR;

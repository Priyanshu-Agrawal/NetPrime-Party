/**
 * CNG-safe iOS fix for fmt 11.0.2 + Xcode 26 / Apple Clang 21.
 *
 * RN's vendored fmt treats FMT_STRING as consteval; newer Clang rejects that.
 * Survives `expo prebuild --clean` via withPodfile post_install.
 */
const { createRunOncePlugin, withPodfile } = require("@expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");

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
].join("\n");

const withFmtXcodeFix = (config) =>
  withPodfile(config, (cfg) => {
    const merged = mergeContents({
      tag: `${PLUGIN_NAME}-post-install`,
      src: cfg.modResults.contents,
      newSrc: POST_INSTALL,
      anchor: /:ccache_enabled => podfile_properties\['apple\.ccacheEnabled'\] == 'true',/,
      offset: 2,
      comment: "#",
    });
    cfg.modResults.contents = merged.contents;
    return cfg;
  });

module.exports = createRunOncePlugin(withFmtXcodeFix, PLUGIN_NAME);

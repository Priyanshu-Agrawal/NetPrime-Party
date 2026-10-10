/**
 * Expo config plugin — Bearoom Android native customizations.
 *
 * Parity with pre-CNG hand-maintained android/ (package com.scriptingbear.bearoom):
 * - Playback Kotlin modules + ic_stat_play drawable
 * - MainApplication BearoomPlaybackPackage registration
 * - MainActivity lifecycle hooks (onPause/onStop/onUserLeaveHint)
 * - Manifest: FGS permissions, POST_NOTIFICATIONS, WRITE_SETTINGS, PiP, playback service
 * - Gradle: androidx.media:media:1.7.1
 * - Legacy deep links: netprime + exp+netprime (alongside app.json scheme bearoom)
 * - Bearoom theme colors (colorPrimary honey, charcoal splash/status via colorPrimaryDark)
 * - ProGuard keep rules for playback classes
 *
 * CNG (app.json) owns: package id, app name, icon/splash assets, bearoom:// scheme, edge-to-edge.
 */
const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidColors,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainActivity,
  withMainApplication,
} = require("@expo/config-plugins");
const { assignColorValue } = require("@expo/config-plugins/build/android/Colors");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");

const PLUGIN_NAME = "bearoom-playback";
const PLUGIN_ROOT = path.join(__dirname);

const BEAROOM = {
  bg: "#100D0A",
  honey: "#F0A93C",
};

/** Legacy APK deep links — keep for upgrades from NetPrime builds. */
const LEGACY_SCHEMES = ["netprime", "exp+netprime"];

function getAndroidPackage(config) {
  return config.android?.package ?? "com.scriptingbear.bearoom";
}

function packageToPath(pkg) {
  return pkg.replace(/\./g, path.sep);
}

function copyPlaybackSources(projectRoot, pkg) {
  const srcDir = path.join(PLUGIN_ROOT, "android", "src", "playback");
  const destDir = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "java",
    packageToPath(pkg),
    "playback",
  );
  fs.mkdirSync(destDir, { recursive: true });

  for (const file of fs.readdirSync(srcDir)) {
    if (!file.endsWith(".kt")) continue;
    const raw = fs.readFileSync(path.join(srcDir, file), "utf8");
    fs.writeFileSync(path.join(destDir, file), raw.replace(/\{\{PACKAGE\}\}/g, pkg));
  }

  const drawableSrc = path.join(PLUGIN_ROOT, "android", "res", "drawable", "ic_stat_play.xml");
  const drawableDest = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "res",
    "drawable",
    "ic_stat_play.xml",
  );
  fs.mkdirSync(path.dirname(drawableDest), { recursive: true });
  fs.copyFileSync(drawableSrc, drawableDest);
}

function ensureLegacyDeepLinkSchemes(mainActivity) {
  let filters = mainActivity["intent-filter"] ?? [];
  if (!Array.isArray(filters)) filters = [filters];

  const viewFilter = filters.find((filter) => {
    const actions = filter.action ?? [];
    const actionList = Array.isArray(actions) ? actions : [actions];
    return actionList.some((a) => a.$?.["android:name"] === "android.intent.action.VIEW");
  });
  if (!viewFilter) return;

  let data = viewFilter.data ?? [];
  if (!Array.isArray(data)) data = data.length ? [data] : [];

  for (const scheme of LEGACY_SCHEMES) {
    if (!data.some((entry) => entry.$?.["android:scheme"] === scheme)) {
      data.push({ $: { "android:scheme": scheme } });
    }
  }
  viewFilter.data = data;
}

function ensurePlaybackService(mainApplication) {
  let services = mainApplication.service ?? [];
  if (!Array.isArray(services)) services = services ? [services] : [];

  const idx = services.findIndex(
    (entry) => entry.$?.["android:name"] === ".playback.BearoomPlaybackService",
  );

  const serviceEntry = {
    $: {
      "android:name": ".playback.BearoomPlaybackService",
      "android:exported": "false",
      "android:foregroundServiceType": "mediaPlayback",
      "android:stopWithTask": "true",
    },
  };

  if (idx >= 0) {
    services[idx] = serviceEntry;
  } else {
    services.push(serviceEntry);
  }

  mainApplication.service = services;
}

const withBearoomPlaybackSources = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      copyPlaybackSources(cfg.modRequest.projectRoot, getAndroidPackage(cfg));
      return cfg;
    },
  ]);

// SDK 53 builds the list as `val packages = PackageList(this).packages` and adds with
// `packages.add(...)`; SDK 54+ uses `PackageList(this).packages.apply { … }` and `add(...)`.
const MODERN_PACKAGES = /PackageList\(this\)\.packages\.apply \{/;
const LEGACY_PACKAGES = /val packages = PackageList\(this\)\.packages/;
// Present in every template from SDK 53 to 57 (SDK 55 deletes ReactNativeHostWrapper).
const IMPORT_ANCHOR = /import expo\.modules\.ApplicationLifecycleDispatcher/;

function addPlaybackToMainApplication(contents, pkg) {
  if (!IMPORT_ANCHOR.test(contents)) {
    throw new Error(`${PLUGIN_NAME}: anchor not found in MainApplication (ApplicationLifecycleDispatcher import)`);
  }
  let out = mergeContents({
    tag: `${PLUGIN_NAME}-main-application-import`,
    src: contents,
    newSrc: `import ${pkg}.playback.BearoomPlaybackPackage`,
    anchor: IMPORT_ANCHOR,
    offset: 1,
    comment: "//",
  }).contents;
  const modern = MODERN_PACKAGES.test(out);
  if (!modern && !LEGACY_PACKAGES.test(out)) {
    throw new Error(`${PLUGIN_NAME}: anchor not found in MainApplication (PackageList)`);
  }
  out = mergeContents({
    tag: `${PLUGIN_NAME}-main-application-package`,
    src: out,
    newSrc: modern
      ? `              add(${pkg}.playback.BearoomPlaybackPackage())`
      : `            packages.add(${pkg}.playback.BearoomPlaybackPackage())`,
    anchor: modern ? MODERN_PACKAGES : LEGACY_PACKAGES,
    offset: 1,
    comment: "//",
  }).contents;
  return out;
}

const withBearoomPlaybackMainApplication = (config) =>
  withMainApplication(config, (cfg) => {
    cfg.modResults.contents = addPlaybackToMainApplication(cfg.modResults.contents, getAndroidPackage(cfg));
    return cfg;
  });

const withBearoomPlaybackMainActivity = (config) =>
  withMainActivity(config, (cfg) => {
    const pkg = getAndroidPackage(cfg);
    let contents = cfg.modResults.contents;

    const importMerge = mergeContents({
      tag: `${PLUGIN_NAME}-main-activity-import`,
      src: contents,
      newSrc: [
        `import ${pkg}.playback.BearoomPlaybackHub`,
        `import ${pkg}.playback.BearoomWebViews`,
      ].join("\n"),
      anchor: /import expo\.modules\.ReactActivityDelegateWrapper/,
      offset: 1,
      comment: "//",
    });
    contents = importMerge.contents;

    const lifecycleMerge = mergeContents({
      tag: `${PLUGIN_NAME}-main-activity-lifecycle`,
      src: contents,
      newSrc: [
        "  override fun onPause() {",
        "    super.onPause()",
        "    BearoomWebViews.resume(this)",
        "    BearoomPlaybackHub.keepAliveSolo()",
        "  }",
        "",
        "  override fun onStop() {",
        "    super.onStop()",
        "    BearoomWebViews.resume(this)",
        "    BearoomPlaybackHub.keepAliveSolo()",
        "  }",
        "",
        "  override fun onUserLeaveHint() {",
        "    super.onUserLeaveHint()",
        "    BearoomWebViews.resume(this)",
        "    BearoomPlaybackHub.keepAliveSolo()",
        "  }",
      ].join("\n"),
      anchor: /^\s+\)\{\}\)$/,
      offset: 2,
      comment: "//",
    });
    contents = lifecycleMerge.contents;

    cfg.modResults.contents = contents;
    return cfg;
  });

const withBearoomPlaybackManifest = (config) =>
  withAndroidManifest(config, async (cfg) => {
    const manifest = cfg.modResults;

    AndroidConfig.Permissions.ensurePermissions(manifest, [
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.WRITE_SETTINGS",
    ]);

    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);

    mainActivity.$["android:supportsPictureInPicture"] = "true";
    ensureLegacyDeepLinkSchemes(mainActivity);
    ensurePlaybackService(mainApplication);

    return cfg;
  });

const withBearoomThemeColors = (config) =>
  withAndroidColors(config, (cfg) => {
    let colors = cfg.modResults;
    colors = assignColorValue(colors, { name: "colorPrimary", value: BEAROOM.honey });
    colors = assignColorValue(colors, { name: "colorPrimaryDark", value: BEAROOM.bg });
    colors = assignColorValue(colors, { name: "splashscreen_background", value: BEAROOM.bg });
    colors = assignColorValue(colors, { name: "iconBackground", value: BEAROOM.bg });
    cfg.modResults = colors;
    return cfg;
  });

const withBearoomPlaybackGradle = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("androidx.media:media")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies \{/,
        'dependencies {\n    implementation("androidx.media:media:1.7.1")',
      );
    }
    return cfg;
  });

const withBearoomProguard = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const pkg = getAndroidPackage(cfg);
      const proguardPath = path.join(
        cfg.modRequest.projectRoot,
        "android",
        "app",
        "proguard-rules.pro",
      );
      if (!fs.existsSync(proguardPath)) return cfg;

      const tag = `${PLUGIN_NAME}-proguard`;
      const block = `-keep class ${pkg}.playback.** { *; }`;
      let contents = fs.readFileSync(proguardPath, "utf8");

      const merged = mergeContents({
        tag,
        src: contents,
        newSrc: block,
        anchor: /# Add any project specific keep options here:/,
        offset: 1,
        comment: "#",
      });

      fs.writeFileSync(proguardPath, merged.contents);
      return cfg;
    },
  ]);

function withBearoomPlayback(config) {
  config = withBearoomPlaybackSources(config);
  config = withBearoomPlaybackMainApplication(config);
  config = withBearoomPlaybackMainActivity(config);
  config = withBearoomPlaybackManifest(config);
  config = withBearoomThemeColors(config);
  config = withBearoomPlaybackGradle(config);
  config = withBearoomProguard(config);
  return config;
}

module.exports = createRunOncePlugin(withBearoomPlayback, PLUGIN_NAME);
module.exports.addPlaybackToMainApplication = addPlaybackToMainApplication;

# Bearoom — Expo SDK 53 → 57 upgrade-impact report

- **Date:** 2026-10-10 (read-only analysis; nothing installed, built or modified in the repo)
- **Repo:** `/Users/essence/ReactNative/NetPrime-Party`, branch `feat/improvements` @ `895d602`
- **From:** expo 53.0.27 · react-native 0.79.6 · react 19.0.0 · Reanimated 3.17 · FlashList 1.7.6
- **To:** expo 57.0.27 (use **≥ 57.0.23**, see §4.L) · react-native 0.86.3 · react 19.2.3 · Reanimated 4.5.1 + react-native-worklets 0.10.1 · FlashList 2.0.2
- **Path:** 53 → 54 → 55 → 57. SDK 56's breaking changes are applied inside the 55 → 57 step.
- **File:line references** are relative to the repo root. node_modules, android, ios, worker, docs and `*.old.*` are excluded unless stated.

> **Correction to the brief: Expo does not tell you to skip SDK 56.**
> - The walkthrough says: "We recommend upgrading SDK versions incrementally, one at a time" ([WALK](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)).
> - What exists is the SDK 56 post's late-August update. It reports a Hermes V1 memory regression in 56 and says "we recommend to upgrade to SDK 57 for all apps that currently use Hermes v1 and SDK 55 or 56. The upgrade from SDK 56 is equivalent to a minor release" ([P56](https://expo.dev/changelog/sdk-56)).
> - So going 55 → 57 is defensible, because you never ship 56's regression. But **every SDK 56 breaking change still applies** (§4).

## Source keys (every cited URL)

| Key | URL |
|---|---|
| P54 | https://expo.dev/changelog/sdk-54 |
| P55 | https://expo.dev/changelog/sdk-55 |
| P56 | https://expo.dev/changelog/sdk-56 |
| P57 | https://expo.dev/changelog/sdk-57 |
| WALK | https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/ |
| VER | https://docs.expo.dev/versions/latest/ |
| BP | https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/ |
| SCENE | https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27 |
| REA54 | https://github.com/expo/fyi/blob/main/expo-54-reanimated.md |
| CL:&lt;pkg&gt; | `https://github.com/expo/expo/blob/main/packages/<pkg>/CHANGELOG.md` |
| TPL-n | `https://github.com/expo/expo/tree/sdk-n/templates/expo-template-bare-minimum` (I also diffed the published `expo-template-bare-minimum@54.0.54 / 55.0.43 / 57.0.29` tarballs) |
| BNM | `https://unpkg.com/expo@<ver>/bundledNativeModules.json` (54.0.37, 55.0.31, 57.0.27) |
| B80 … B86 | https://reactnative.dev/blog/2025/06/12/react-native-0.80 · /2025/08/12/react-native-0.81 · /2025/10/08/react-native-0.82 · /2025/12/10/react-native-0.83 · /2026/02/11/react-native-0.84 · /2026/04/07/react-native-0.85 · /2026/06/11/react-native-0.86 |
| B87 | https://reactnative.dev/blog/2026/08/11/react-native-0.87 (out of scope; cited only for what comes next) |
| SJS | https://reactnative.dev/blog/2025/06/12/moving-towards-a-stable-javascript-api |
| E2E | https://github.com/react-native-community/discussions-and-proposals/discussions/921 |
| RNCL | https://github.com/facebook/react-native/blob/main/CHANGELOG.md |
| R192 | https://react.dev/blog/2025/10/01/react-19-2 |
| FWD | https://react.dev/reference/react/forwardRef |
| RHL | https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/CHANGELOG.md |
| TS6 | https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ |

---

## 0. Executive summary

**Things that block a build:**

1. **Both local config plugins fail on a clean prebuild.**
   - `plugins/bearoom-playback/withBearoomPlayback.js:161` anchors on `val packages = PackageList(this).packages`. That line is gone from the SDK 54 template.
   - `withBearoomPlayback.js:151` anchors on `import expo.modules.ReactNativeHostWrapper`. That import is deleted in SDK 55.
   - `plugins/with-fmt-xcode-fix.js:56` anchors on `:ccache_enabled => podfile_properties['apple.ccacheEnabled'] == 'true',`. The SDK 54+ Podfile no longer has it.
   - `mergeContents` throws `ERR_NO_MATCH` on any of these.
   - **SDK 57's `expo prebuild` cleans by default** ([P57](https://expo.dev/changelog/sdk-57)), so this will be hit.
2. **The `react-native-webview` patch must be re-created for 13.16.1.** `BearoomWebViews.kt` imports `AlwaysVisibleRNCWebView`, a class that exists only through the patch. If the patch fails to apply, the Android build fails to compile (§5).
3. **iOS on Xcode 27** needs `expo-build-properties` `ios.enableSceneSupport: true`, which requires **expo ≥ 57.0.23** ([BP](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/), [SCENE](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27)). It only works on the stock SDK 57 AppDelegate, so `ios/` must be regenerated first.
4. **`jest` breaks without `@react-native/jest-preset`.** jest-expo 57's `jest-preset.js` throws when that package is missing ([B85](https://reactnative.dev/blog/2026/04/07/react-native-0.85)).

**Silent runtime regressions:**

5. **`StyleSheet.absoluteFillObject` is removed in RN 0.85** ([B85](https://reactnative.dev/blog/2026/04/07/react-native-0.85)). There are 9 call sites, all of the form `...StyleSheet.absoluteFillObject`. Spreading `undefined` does not crash; the overlay just loses `position: absolute`. That breaks the player loading/buffer overlays, sheets and scrims.
6. **Reanimated layout animations are still in the code**, despite the project rule in `theme/motion.ts:12-17`. They are at `PartyScreen.tsx:766-767` and `:893-894`, `JoinPartyScreen.tsx:144` and `PersonDetailsScreen.tsx:161`. The PropsRegistry crash recorded for Reanimated 3 has to be re-verified under Reanimated 4, or (better) these props removed.
7. **`expo/fetch` replaces global `fetch` in SDK 56** ([P56](https://expo.dev/changelog/sdk-56)). That affects RTK Query `fetchBaseQuery`, supabase-js, the GIF client, the timeout/abort wrapper, and the planned on-device scrapers that need `redirect:'manual'`. The opt-out is `EXPO_PUBLIC_USE_RN_FETCH=1`.
8. **Hermes V1 is the default from SDK 56 / RN 0.84.**
   - The worklets memory regression is fixed only in expo **57.0.9+** ([P57](https://expo.dev/changelog/sdk-57)).
   - `eval` is global-scope only.
   - `new Function` should still work, because Hermes `EnableEval` defaults to true. This is **unverified on device**.
   - No app code uses either today.

**Tooling churn:**

- TypeScript 6.0 sets `types: []` by default, which breaks the jest globals and `process` types.
- `eslint-plugin-react-hooks` 7 turns on the compiler rules (at error) through eslint-config-expo 57.
- Node 22.13 is recommended for SDK 57; CI uses Node 20.
- `@expo/vector-icons` 15 redraws some icon families.

---

## 1. Baseline → target versions (from BNM for 54/55/57; `api.expo.dev/v2/versions` for TS/@types)

| Package | Now | SDK 54 | SDK 55 | SDK 57 |
|---|---|---|---|---|
| expo | ~53.0.14 (53.0.27 installed) | 54.0.37 | 55.0.31 | **57.0.27** (≥57.0.23 required) |
| react-native | 0.79.6 | 0.81.5 | 0.83.10 | 0.86.3 |
| react / react-dom | 19.0.0 | 19.1.0 | 19.2.0 | 19.2.3 |
| @types/react | ~19.0.10 | ~19.1.10 | ~19.2.10 | ~19.2.4 |
| typescript | ~5.8.3 | ~5.9.2 | ~5.9.2 | **~6.0.3** (from SDK 56) |
| react-native-reanimated | ~3.17.4 | ~4.1.1 | 4.2.1 | 4.5.1 |
| react-native-worklets | — (new) | 0.5.1 | 0.7.4 | 0.10.1 |
| @shopify/flash-list | 1.7.6 | 2.0.2 | 2.0.2 | 2.0.2 |
| react-native-gesture-handler | ~2.24.0 | ~2.28.0 | ~2.30.0 | ~2.32.0 |
| react-native-screens | ~4.11.1 | ~4.16.0 | ~4.23.0 | ~4.26.0 |
| react-native-safe-area-context | 5.4.0 | ~5.6.0 | ~5.6.2 | ~5.7.0 |
| react-native-webview | 13.13.5 (patched) | 13.15.0 | 13.16.0 | 13.16.1 |
| @react-native-community/netinfo | 11.4.1 | 11.4.1 | 11.5.2 | 12.0.1 |
| react-native-keyboard-controller | ^1.22.3 (1.22.3 installed) | 1.18.5 | 1.20.7 | 1.21.9 (**the app is already newer**; see §6) |
| react-native-get-random-values | ~1.11.0 | ~1.11.0 | ~1.11.0 | ~1.11.0 |
| react-native-web | ~0.20.0 | ~0.21.0 | ~0.21.0 | ~0.21.0 |
| @expo/metro-runtime | ~5.0.5 | ~6.1.2 | ~55.0.12 | ~57.0.16 |
| @expo/vector-icons | ^14.1.0 | ^15.0.3 | ^15.0.2 | ^15.0.2 |
| expo-asset / constants / font / keep-awake / linking | 11.1 / 17.1 / 13.3 / 14.1 / 7.1 | 12 / 18 / 14 / 15 / 8 | 55.x | ~57.0.19 / ~57.0.21 / ~57.0.4 / ~57.0.2 / ~57.0.12 |
| expo-dev-client | ~5.2.4 | ~6.0.21 | ~55.0.40 | ~57.0.19 |
| expo-file-system | ~18.1.11 | ~19.0.24 | ~55.0.26 | ~57.0.7 |
| expo-image | ~2.4.1 | ~3.0.11 | ~55.0.11 | ~57.0.5 |
| expo-splash-screen / status-bar / system-ui | 0.30 / 2.2 / 5.0 | 31 / 3.0 / 6.0 | 55.x | ~57.0.9 / ~57.0.1 / ~57.0.4 |
| expo-blur / haptics / linear-gradient / screen-orientation / symbols / web-browser | 14.1 / 14.1 / 14.1 / 8.1 / 0.4 / 14.2 | 15 / 15 / 15 / 9 / 1.0 / 15 | 55.x | ~57.0.x |
| expo-build-properties | — (new, needed for scene support) | ~1.0.10 | ~55.0.18 | ~57.0.22 |
| jest-expo | ~53.0.14 | ~54.0.18 | ~55.0.22 | ~57.0.5 (+ peer `@react-native/jest-preset` ^0.86.3) |
| eslint-config-expo | ~9.2.0 | ~10.0.0 | ~55.0.1 | ~57.0.2 (pulls `eslint-plugin-react-hooks` ^7) |
| jest / @types/jest | ~29.7.0 / ^29.5.14 | unchanged | unchanged | unchanged (29.7 / 29.5.14) |

Packages Expo does not manage are covered in §6.

**Dependencies with no app import:**
- `react-native-fs` has zero references in app code.
- `expo-blur` is replaced by `@sbaiahmed1/react-native-blur` in `src/ui/Frost.tsx:15`.
- `expo-file-system` is never imported (`expo` depends on it anyway).
- `@react-navigation/elements` is never imported.
- `expo-symbols` is used only by `components/ui/IconSymbol.ios.tsx:1`, and nothing imports that component.

Removing `react-native-fs` and `expo-blur` takes two native modules out of the upgrade surface.

---

## 2. Step 1 — SDK 53 → 54 (expo 54.0.37 · RN 0.81.5 · React 19.1.0)

### 2.1 Package bumps

```sh
npm i expo@~54.0.37 && npx expo install --fix   # bumps all expo-* / RN / react / reanimated / flash-list / screens / gh / sac / webview
npx expo install react-native-worklets          # 0.5.1, required by Reanimated 4
npm i -D typescript@~5.9.2 @types/react@~19.1.10
```

- Exclude `react-native-keyboard-controller` from `expo install --fix` (or accept the downgrade to 1.18.5). Put it in `package.json` → `expo.install.exclude`.
- Re-check `patches/react-native-webview+13.13.5.patch` after the bump to 13.15.0 (§5).

### 2.2 Breaking changes and Bearoom impact

| # | Change (source) | Bearoom impact (file:line) | Fix |
|---|---|---|---|
| 54-1 | **Local config-plugin anchors broken by the template change** (TPL-54). MainApplication now builds packages with `PackageList(this).packages.apply { … }`, and the Podfile calls `:ccache_enabled => ccache_enabled?(podfile_properties),` | `plugins/bearoom-playback/withBearoomPlayback.js:161` (anchor `/val packages = PackageList\(this\)\.packages/`) → `ERR_NO_MATCH`. `plugins/with-fmt-xcode-fix.js:56` (anchor on the old ccache line) → `ERR_NO_MATCH`. A non-clean prebuild does **not** fail, because `mergeContents` is a no-op when its header is already present. But it also leaves the SDK 53 `MainApplication.kt` (`SoLoader.init`, `DefaultReactNativeHost`, `isHermesEnabled`) in place, and that no longer matches the RN 0.81 template | Apply the SDK-57-proof anchors from §4.K **now**. They are valid for TPL-54, 55 and 57. Then run `npx expo prebuild --clean` |
| 54-2 | **Precompiled RN core for iOS is on by default** (`RCT_USE_RN_DEP=1`, `RCT_USE_PREBUILT_RNCORE=1`) ([P54](https://expo.dev/changelog/sdk-54), TPL-54 Podfile L17-18) | `with-fmt-xcode-fix.js:17-38` patches the `fmt` pod. With the prebuilt ReactNativeDependencies there is no `fmt` pod source, so the block is a no-op (it is guarded by `File.exist?`) | Keep the guarded block, or delete it once a clean iOS build passes. Do **not** set `ios.buildReactNativeFromSource` |
| 54-3 | **Android edge-to-edge is always on and cannot be disabled.** `react-native-edge-to-edge` is no longer an `expo` dependency ([P54](https://expo.dev/changelog/sdk-54) "Edge-to-edge is now always enabled"). On RN 0.81 with edge-to-edge, StatusBar `backgroundColor`/`translucent` do nothing, `hidden` uses immersive mode, and Modal `statusBarTranslucent`/`navigationBarTranslucent` are always treated as true ([B81](https://reactnative.dev/blog/2025/08/12/react-native-0.81), [E2E](https://github.com/react-native-community/discussions-and-proposals/discussions/921)) | Already opted in: `app.json:25` `android.edgeToEdgeEnabled: true` and `android/gradle.properties` `expo.edgeToEdgeEnabled=true`. No-op props: `App.tsx:120-123` and `HomeView.tsx:56,64` (`<StatusBar translucent>`); `PlayerScreen.tsx:603` (`translucent hidden={isImmersive}`, where `hidden` now gives true immersive mode, which is good for the player); `PartyScreen.tsx:563`; Modal props at `PartyTray.tsx:179-180`, `GifPicker.tsx:147`, `PlayerSettingsSheet.tsx:52`, `BearAlert.tsx:60`. `withBearoomPlayback.js:246` sets `colorPrimaryDark` (described as the "charcoal … status" colour), which no longer colours the transparent bars. `App.tsx:88` `SystemUI.setBackgroundColorAsync` still sets the root background (fine). The repo has no `expo-navigation-bar` and no `react-native-edge-to-edge` | No code change needed for 54. Keep the Modal props (they are ignored); drop `translucent` at 56 (§4.F). Re-check on device: the bottom insets of the tab bar, PartyTray and keyboard sticky views |
| 54-4 | **Predictive back is opt-in** via `android.predictiveBackGestureEnabled` (still `false` in 57) ([P54](https://expo.dev/changelog/sdk-54), [APP57](https://docs.expo.dev/versions/v57.0.0/config/app/)) | `hooks/useMediaCloseGuard.ts:20,62` uses JS `BackHandler`, which works either way ([B81](https://reactnative.dev/blog/2025/08/12/react-native-0.81)). The MainActivity `invokeDefaultOnBackPressed` override comes from the template | Leave the flag unset. If you enable it later, re-test the close guard on Player/Party |
| 54-5 | **Reanimated 4 is required** on the New Architecture. Add `react-native-worklets`; leave `babel.config.js` alone because babel-preset-expo adds `react-native-worklets/plugin` ([P54](https://expo.dev/changelog/sdk-54), [REA54](https://github.com/expo/fyi/blob/main/expo-54-reanimated.md)) | `babel.config.js:3-6` (preset only) needs no change. API surface: `components/party/PartyTray.tsx:57,440` uses `runOnJS` inside a `Gesture.Pan().onEnd` worklet with `.runOnJS(false)` at `:442`. Springs in `theme/motion.ts:54-58` use only `damping/stiffness/mass/reduceMotion`. `useCollapsingHeader.ts:4-12`, `KindToggle`, `SearchInput`, `BouncyPressable`, `ConnectivityBanner` and `GifPicker` use only `useSharedValue/useAnimatedStyle/withTiming/withSpring/withRepeat/withSequence/interpolate/interpolateColor/useAnimatedScrollHandler` | Nothing removed is used: `useAnimatedGestureHandler`, `useWorkletCallback` and `combineTransition` are all absent ([migration guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x/)). `runOnJS` is a deprecated alias in 4.x; replace it with `scheduleOnRN(onClose)` from `react-native-worklets` (`PartyTray.tsx:57,440`). The `withSpring` defaults moved to damping 120 / stiffness 900 / **mass 4** ([withSpring](https://docs.swmansion.com/react-native-reanimated/docs/animations/withSpring/)). The presets in `theme/motion.ts` set `mass`, so they are unaffected. For layout animations see 54-6 |
| 54-6 | **Reanimated layout animations** (`entering/exiting/layout`). The project rule (`theme/motion.ts:12-17`, `src/ui/Appear.tsx:12-20`) says none should exist, because of the New Architecture `PropsRegistry::handleNodeRemovals` crash | **The rule is violated in 3 files:** `src/screens/PartyScreen.tsx:44` imports `FadeIn, FadeOut, SlideInRight, SlideOutRight`; `:766-767` puts `entering={FadeIn.duration(200)}` / `exiting={FadeOut.duration(150)}` on the landscape quick reactions; `:893-894` puts `SlideInRight/SlideOutRight` on the landscape chat panel. `src/screens/JoinPartyScreen.tsx:14,144` has `entering={FadeIn}` on the error text. `src/screens/PersonDetailsScreen.tsx:17,161` has `layout={LinearTransition.springify().damping(18).stiffness(150)}` | Remove them, or re-implement imperatively through `Appear`/`withTiming`, before the Reanimated 4 bump. That way any crash after the bump is attributable. If you keep them:<br>• Device-test leaving Party/Person screens on a **release** build (per [[ui-animation-quality-bar]]).<br>• Prefer Reanimated **4.5.5** over the 4.5.1 pin. 4.5.3 and 4.5.4 fix crashes from withheld *exiting* layout animations ([4.5.3](https://github.com/software-mansion/react-native-reanimated/releases/tag/4.5.3), [4.5.4](https://github.com/software-mansion/react-native-reanimated/releases/tag/4.5.4)).<br>• `PersonDetailsScreen.tsx:161` sets no `mass`, so under the Reanimated 4 default of mass 4 it becomes slower and bouncier. Add `.mass(1)` to keep today's feel |
| 54-7 | **FlashList 1 → 2** (SDK 54 BNM 2.0.2) ([v2-migration](https://shopify.github.io/flash-list/docs/v2-migration), [v2-changes](https://shopify.github.io/flash-list/docs/v2-changes), [v2.0.0](https://github.com/Shopify/flash-list/releases/tag/v2.0.0)):<br>• New Architecture only; v2 throws on the old architecture.<br>• Removed: `estimatedItemSize`, `estimatedListSize`, `estimatedFirstItemOffset`, `onBlankArea`, `disableAutoLayout`, `disableHorizontalListHeightMeasurement`.<br>• `overrideItemLayout` now sets span only.<br>• `MasonryFlashList` becomes the `masonry` prop.<br>• Refs are typed `FlashListRef<T>`.<br>• `inverted` is absent until 2.3.0.<br>• **`maintainVisibleContentPosition` is on by default** | Single usage: `src/features/search/SearchView.tsx:32` (import) and `:270-289`. `estimatedItemSize={183}` at `:279` is removed in v2. `getItemType` at `:280` is still supported. `numColumns={COLS}` (`COLS=3`, `:19`) is used with fixed-width cells (`GridItem.tsx:9-10` `gridColumnWidth(3)`), per-column alignment (`SearchView.tsx:105-115`), and `contentContainerStyle` with `paddingHorizontal` (`:244-247`, styles `grid`). `onEndReached` + `onEndReachedThreshold={0.75}` at `:287-288`, plus the manual "short list" auto-fill in `useSearchData.ts:363-375` | • Delete `estimatedItemSize` (it is a TS error in v2).<br>• Keep `keyExtractor`; v2 warns without it while `maintainVisibleContentPosition` is on.<br>• `getItemType`, `numColumns`, the `List*Component` props, `onEndReached`/`onEndReachedThreshold`, `keyboardShouldPersistTaps` and `showsVerticalScrollIndicator` are unchanged.<br>• Consider `maintainVisibleContentPosition={{ disabled: true }}`, so that replacing results on a new query or filter does not try to hold the scroll anchor.<br>• Rows now size to their tallest cell. Verify the 3-column spacing (padding is honoured in v2) and that the `useSearchData.ts:363` auto-fill still terminates.<br>• No ref, masonry, `inverted` or `overrideItemLayout` usage |
| 54-8 | **expo-file-system: the new API is the default export; the old one moves to `expo-file-system/legacy`.** Legacy calls from the root now throw ([P54](https://expo.dev/changelog/sdk-54), CL:expo-file-system 19.0.9) | **No imports in the app.** `grep` finds no `expo-file-system` or `FileSystem.` in app code | None. Optionally drop the direct dependency (`expo` still depends on it) |
| 54-9 | **Metro / babel**: `experimentalImportSupport` (ESM live bindings) on by default; `metro/src/*` → `metro/private/*`; unhandled promise rejections logged as errors ([P54](https://expo.dev/changelog/sdk-54); [Metro 0.83](https://github.com/facebook/metro/releases/tag/v0.83.0)) | `metro.config.js:2-24` uses only `expo/metro-config` and `resolver.resolveRequest` (cheerio redirect), so it is fine. Fire-and-forget promises that will now surface rejections: `services/gifs.ts:149,159` (`void fetch(...)`), `App.tsx:88` (`void SystemUI…`) | Add `.catch(() => {})` to the `void` fetches. Opt-out if live bindings break something: `EXPO_UNSTABLE_LIVE_BINDINGS=false` |
| 54-10 | **RN 0.80 deep-import deprecation** and opt-in strict TS API ([B80](https://reactnative.dev/blog/2025/06/12/react-native-0.80), [SJS](https://reactnative.dev/blog/2025/06/12/moving-towards-a-stable-javascript-api)) | **0 deep imports** (no `react-native/Libraries` or `react-native/src` anywhere in app code) | None. Nothing breaks before RN 0.87, where `Libraries/*` becomes a TS error ([B87](https://reactnative.dev/blog/2026/08/11/react-native-0.87)) |
| 54-11 | **RN 0.81 `<SafeAreaView>` deprecated** ([B81](https://reactnative.dev/blog/2025/08/12/react-native-0.81)) | None. `src/ui/Screen.tsx:6` and `src/screens/PlayerScreen.tsx:62` import `SafeAreaView` from `react-native-safe-area-context` | None |
| 54-12 | **JSC removed from core** ([B81](https://reactnative.dev/blog/2025/08/12/react-native-0.81)) | Hermes already (`ios/Podfile.properties.json` `expo.jsEngine: hermes`, `gradle.properties` `hermesEnabled=true`) | None |
| 54-13 | **React 19.1**: owner stacks; `useId` format change; `act` gone from production builds ([React CHANGELOG](https://github.com/facebook/react/blob/main/CHANGELOG.md)) | No `useId`. Tests are pure-logic (4 files) | None |
| 54-14 | **Xcode ≥ 16.1 (26 recommended); Node ≥ 20.19.4** ([P54](https://expo.dev/changelog/sdk-54), [VER](https://docs.expo.dev/versions/latest/)) | CI `.github/workflows/Main.yml:23` `node-version: '20'` resolves to the latest 20.x, which is OK | None for 54 |
| 54-15 | **Template-level Android changes**: `loadReactNative(this)` + `ReleaseLevel` replace `SoLoader.init` and `load()`; `enableMinifyInReleaseBuilds` replaces `enableProguardInReleaseBuilds` (TPL-54, [P54](https://expo.dev/changelog/sdk-54)) | Committed `android/app/src/main/java/com/scriptingbear/bearoom/MainApplication.kt:13-14,51-55` is the SDK 53 form | Regenerate with `npx expo prebuild --clean` after fixing 54-1. Then confirm `-keep class com.scriptingbear.bearoom.playback.** { *; }` is still present in `proguard-rules.pro` (anchor `# Add any project specific keep options here:` still exists in TPL-57) |
| 54-16 | **Autolinking revamp: transitive React Native modules are now autolinked**, following direct dependencies and peerDependencies ([P54](https://expo.dev/changelog/sdk-54) "Improved package manager support and Expo Autolinking revamp") | `react-native-shimmer-placeholder` declares the peer `react-native-linear-gradient >=2.4.0`. npm installed **`react-native-linear-gradient@2.8.3`** (`package-lock.json:12648`), and it is not linked today (absent from `ios/Podfile.lock`). From 54 it becomes a newly linked old-style native module. The app never uses it: `createShimmerPlaceholder(LinearGradient)` gets `expo-linear-gradient` at `components/home/HeroCarousel.tsx:29`, `src/ui/DetailsSkeleton.tsx:14` and `src/ui/PosterSkeleton.tsx:9`. My scan of node_modules found it is the only new transitive native module; `react-native-edge-to-edge` simply drops out | Add `"expo": { "autolinking": { "exclude": ["react-native-linear-gradient"] } }` to `package.json`. Verify with `npx expo-modules-autolinking verify -v` (recommended in P54) |

---

## 3. Step 2 — SDK 54 → 55 (expo 55.0.31 · RN 0.83.10 · React 19.2.0)

### 3.1 Package bumps

```sh
npm i expo@~55.0.31 && npx expo install --fix   # versions now match the SDK major (55.x)
# worklets → 0.7.4, reanimated 4.2.1, screens ~4.23, gh ~2.30, sac ~5.6.2, webview 13.16.0, netinfo 11.5.2
```

### 3.2 Breaking changes and Bearoom impact

| # | Change (source) | Bearoom impact (file:line) | Fix |
|---|---|---|---|
| 55-1 | **Legacy Architecture removed.** `newArchEnabled` is gone from app.json; `jsEngine`, `newArchEnabled` and `edgeToEdgeEnabled` are gone from the config schema ([P55](https://expo.dev/changelog/sdk-55)); RN 0.82 ignores `newArchEnabled=false` ([B82](https://reactnative.dev/blog/2025/10/08/react-native-0.82)) | `app.json:10` `"newArchEnabled": true`, `app.json:25` `"edgeToEdgeEnabled": true` | Delete both keys. `android/gradle.properties` is regenerated |
| 55-2 | **`ReactNativeHostWrapper` deleted.** MainApplication becomes `override val reactHost by lazy { ExpoReactHostFactory.getDefaultReactHost(context = applicationContext, packageList = PackageList(this).packages.apply { … }) }` (TPL-55, CL:expo) | `withBearoomPlayback.js:151` import anchor `/import expo\.modules\.ReactNativeHostWrapper/` → `ERR_NO_MATCH` on prebuild | Anchor the import on `/import expo\.modules\.ApplicationLifecycleDispatcher/` (present in TPL-54/55/57); see §4.K |
| 55-3 | **AppDelegate template**: `internal import Expo`, `@main`, non-public class, no `bindReactNativeFactory` (TPL-55; `EXAppDelegateWrapper` removed per CL:expo) | `ios/Bearoom/AppDelegate.swift:1,5-6,22` is the SDK 54 form. No local plugin edits AppDelegate | Regenerate `ios/` (`prebuild --clean`) |
| 55-4 | **Legacy native-module interop retained.** RN 0.82 says interop layers stay "for the foreseeable future" ([B82](https://reactnative.dev/blog/2025/10/08/react-native-0.82)). In the RN 0.86.3 source, `ReactPackageTurboModuleManagerDelegate.kt:26-28,61-64` still calls `createNativeModules` when `useTurboModuleInterop()` is on | `plugins/bearoom-playback/android/src/playback/BearoomPlaybackPackage.kt:8-13` (`ReactPackage.createNativeModules`, now `@Deprecated`) and `BearoomPlaybackModule.kt:6-12` (`ReactContextBaseJavaModule` + `@ReactMethod`). JS: `components/player/backgroundPlayback.ts:10,21,56` (`NativeModules.BearoomPlayback`, `DeviceEventEmitter`) | Works as-is (expect a Kotlin deprecation warning). Later: move to `BaseReactPackage`, or make it a local Expo module so autolinking removes the MainApplication edit entirely |
| 55-5 | **RN 0.82: unhandled promise rejections → `console.error`** ([B82](https://reactnative.dev/blog/2025/10/08/react-native-0.82)) | Same sites as 54-9 | Same fix |
| 55-6 | **RN 0.82: `Appearance.setColorScheme(null)` no longer typed**; use `'unspecified'` ([B82](https://reactnative.dev/blog/2025/10/08/react-native-0.82)) | `App.tsx:42` passes `"dark"` | None |
| 55-7 | **RN 0.82: `StyleSheet.absoluteFillObject` deprecated** ([RNCL](https://github.com/facebook/react-native/blob/main/CHANGELOG.md); `StyleSheet.d.ts` at v0.84.0 L131-134 `@deprecated Use StyleSheet.absoluteFill`) | 9 sites (§4.B) | Fix now (cheap), before it is removed in 0.85 |
| 55-8 | **expo-status-bar 55: `backgroundColor`/`translucent` deprecated no-ops** ([P55](https://expo.dev/changelog/sdk-55), CL:expo-status-bar 55.0.4) | `App.tsx:122`, `HomeView.tsx:56,64`, `PlayerScreen.tsx:603` | Remove `translucent` (removed outright in 56) |
| 55-9 | **expo-blur: `dimezisBlurView` needs `<BlurTargetView>`; `experimentalBlurMethod` → `blurMethod`** ([P55](https://expo.dev/changelog/sdk-55)) | Not imported (`Frost.tsx` uses `@sbaiahmed1/react-native-blur`) | Remove `expo-blur` from `package.json` |
| 55-10 | **expo-screen-orientation `remove*Listener` deprecated** (CL:expo-screen-orientation) | Only `lockAsync` is used (`App.tsx:90,100` and Player/Party) | None |
| 55-11 | **expo-av removed** from the SDK ([P55](https://expo.dev/changelog/sdk-55)) | Not used | None |
| 55-12 | **Hermes V1 opt-in** (`useHermesV1`) ([P55](https://expo.dev/changelog/sdk-55)) | — | Do not opt in on 55; it becomes the default at 56/57 |
| 55-13 | **React 19.2**: `<Activity>`, `useEffectEvent`; `useId` prefix `_r_`; Context display names ([R192](https://react.dev/blog/2025/10/01/react-19-2)) | None affected | None |
| 55-14 | **Xcode 26 minimum; Gradle 9.0.0** (TPL-55; [P55](https://expo.dev/changelog/sdk-55)) | CI JDK 17 (`Main.yml:28`) is OK for Gradle 9 | Local Xcode must be 26+ (27 is installed, per the board) |
| 55-15 | **`eas update` requires `--environment`**; `app.config.ts` is transpiled with the project's TypeScript ([P55](https://expo.dev/changelog/sdk-55)) | `expo-updates` is not installed; no `app.config.ts` | None |

---

## 4. Step 3 — SDK 55 → 57, including SDK 56 (expo ≥ 57.0.23 · RN 0.86.3 · React 19.2.3)

### 4.1 Package bumps

```sh
npm i expo@~57.0.27 && npx expo install --fix
# reanimated 4.5.1, worklets 0.10.1, gh ~2.32, screens ~4.26, sac ~5.7.0, webview 13.16.1, netinfo 12.0.1, react 19.2.3
npx expo install expo-build-properties          # ~57.0.22, for ios.enableSceneSupport
npm i -D @react-native/jest-preset@0.86.3 typescript@~6.0.3 @types/react@~19.2.4
npm i @expo/vector-icons@^15.0.2                # `expo` no longer depends on it (SDK 56)
```

### 4.2 Breaking changes and Bearoom impact

**A. Hermes V1 is the default** (RN 0.84 [B84](https://reactnative.dev/blog/2026/02/11/react-native-0.84); Expo 56 [P56](https://expo.dev/changelog/sdk-56); `RCT_HERMES_V1_ENABLED` in the TPL-57 Podfile L18).
- **Regressions:**
  - Memory blow-up when worklets/Reanimated are imported, expo/expo#46519. Fixed in **expo 57.0.9** / RN 0.86.2.
  - Slow dev startup. Fixed in **57.0.17** / RN 0.86.3 ([P57](https://expo.dev/changelog/sdk-57)).
- **Semantics:** Hermes V1 runs `eval` only at global scope; it has no `with`, and `Function.prototype.toString` returns no source ([Hermes Features.md](https://github.com/facebook/hermes/blob/static_h/doc/Features.md)). `EnableEval` defaults to true for `eval` and `new Function` ([RuntimeConfig.h](https://github.com/facebook/hermes/blob/static_h/public/hermes/Public/RuntimeConfig.h)), but it is **unverified on an RN 0.86 device build**.
- **Bearoom impact:** app code makes no `eval` or `new Function` call. The only one is `scripts/upload-bridge.ts:56`, a Node script. The bridge scripts in `src/scripts/*` run inside the WebView page, so they are unaffected.
  - The planned Nuvio-style on-device scrapers (memory: "plugin runs inside Bearoom's Hermes (eval/new Function work)") need a device smoke test: `new Function('return 1')()` and an indirect `(0,eval)('1+1')`.
- **Opt-out:** `expo-build-properties` `useHermesV1: false`. This forces `buildReactNativeFromSource: true` ([BP](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/)).

**B. `StyleSheet.absoluteFillObject` removed in RN 0.85** ([B85](https://reactnative.dev/blog/2026/04/07/react-native-0.85)).
- Checked in the source: the symbol is present in `Libraries/StyleSheet/StyleSheetExports.js` at v0.84.0 and absent at v0.85.0 and v0.86.3.
- Every hit is a spread, so there is **no crash, only a silent loss of `position:absolute;inset:0`**, plus a TS error. The 9 sites:

| File:line | What it styles |
|---|---|
| `components/player/HijackPlayer.tsx:789` | branded loading overlay |
| `components/player/HijackPlayer.web.tsx:186` | web loading overlay |
| `components/player/PlayerControls.tsx:458` | `center` |
| `components/player/PlayerControls.tsx:459` | `bufferLayer` |
| `components/player/EpisodeSheet.tsx:269` | sheet overlay |
| `src/ui/BearAlert.tsx:147` | alert overlay |
| `src/screens/PersonDetailsScreen.tsx:139` | used directly as `style={StyleSheet.absoluteFillObject}` |
| `src/screens/MovieDetailsScreen.tsx:544` | `clipScrim` |
| `src/screens/CollectionScreen.tsx:116` | `backdropScrim` |
| `src/screens/TvDetailsScreen.tsx:606` | overlay |

- **Fix:** replace each with `StyleSheet.absoluteFill` (a plain object since 0.7x, so it can be spread).

**C. Jest preset moved to `@react-native/jest-preset`** ([B85](https://reactnative.dev/blog/2026/04/07/react-native-0.85); RN 0.86.3 `peerDependencies`; CL:jest-expo 56.0.1).
- `jest-expo@57.0.5/jest-preset.js` L7-19 throws: "The React Native Jest preset that jest-expo relies on has moved to a separate package … install "@react-native/jest-preset"".
- **Bearoom impact:** `package.json` `jest.preset: "jest-expo"` with 4 tests: `src/store/features/providers/configCache.test.ts`, `providersSlice.test.ts`, `services/party/protocol.test.ts`, `components/player/capabilities.test.ts`.
- **Fix:** `npm i -D @react-native/jest-preset@0.86.3`. Keep `transformIgnorePatterns`; also consider adding `react-native-worklets` to it if a test ever imports Reanimated.

**D. `expo/fetch` is the global `fetch`** (SDK 56: "expo/fetch is now installed as the default implementation of globalThis.fetch … To opt out, set EXPO_PUBLIC_USE_RN_FETCH=1" [P56](https://expo.dev/changelog/sdk-56)).
- **Bearoom call sites:**
  - `src/store/services/workerApi.ts:26`: `fetchBaseQuery` builds a `Request` object and passes it to `fetch`.
  - `utils/fetchWithTimeout.ts:21-24`: `AbortController` + `signal`.
  - `utils/checkGithubRelease.ts:12`.
  - `services/gifs.ts:96,130,149,159`.
  - supabase-js REST/auth in `services/supabase.ts`.
  - The on-device scrapers' `redirect:'manual'` gap (memory: RN fetch ignored it). It may actually improve under expo/fetch; verify.
- **Fix:** smoke-test `/config` (worker), TMDB, KLIPY, Supabase auth and the realtime join. If anything regresses, add `EXPO_PUBLIC_USE_RN_FETCH=1` to `.env`/`.env.local` and EAS env.

**E. `@expo/vector-icons`** (SDK 56: "the expo package no longer depends on @expo/vector-icons … explicitly add it" [P56](https://expo.dev/changelog/sdk-56)).
- It is already a direct dependency (`^14.1.0`). Bump it to `^15.0.2`.
- v15 is "BREAKING: update icon families". AntDesign and Feather are named; Ionicons/Octicons have visual changes ([vector-icons#341](https://github.com/expo/vector-icons/pull/341), [releases](https://github.com/expo/vector-icons/releases), issue #357 "Breaking visual changes in AntDesign, Ionicons, Octicons").
- **Bearoom impact:** `Ionicons` in 41 import sites; `MaterialIcons` in `components/ui/IconSymbol.tsx`.
- **Fix:** run `tsc`, because removed glyph names are type errors. Then do a visual pass on the tab bar and player controls. Longer-term, Expo plans to replace it with `@react-native-vector-icons/*` ([P56](https://expo.dev/changelog/sdk-56)).

**F. expo-status-bar 56 removes the `backgroundColor`/`translucent`/`networkActivityIndicatorVisible` props** (CL:expo-status-bar 56.0.0).
- **Sites (TS errors):** `App.tsx:122`, `src/features/home/HomeView.tsx:56`, `:64`, `src/screens/PlayerScreen.tsx:603`.
- **Fix:** delete `translucent`. `style` and `hidden` stay.

**G. expo-navigation-bar API removals; `AndroidConfig.StatusBar` → `AndroidConfig.SystemBars`** (CL:expo-navigation-bar 56.0.0, CL:@expo/config-plugins).
- Bearoom uses neither. `withBearoomPlayback.js` uses only `AndroidConfig.Permissions` / `AndroidConfig.Manifest`; I checked that both still exist in `@expo/config-plugins@57.0.10`.

**H. iOS minimum 16.4; Xcode ≥ 26.4; precompiled Expo modules on by default** ([P56](https://expo.dev/changelog/sdk-56); TPL-56/57 Podfile L21-23 `platform :ios, … || '16.4'`; [BP](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/) `usePrecompiledModules`).
- **Bearoom impact:** `plugins/with-fmt-xcode-fix.js:39-47` raises pods only to `15.1`, which is now below the app floor. `ios/Bearoom.xcodeproj/project.pbxproj:349,380,448` say `15.1`, but these are regenerated.
- **Fix:** change both `'15.1'` literals to `'16.4'`, or drop the block once a clean Xcode 27 build passes. The Xcode 27 rule is "<15.0 rejected", so pods at 16.4 are fine.

**I. React Navigation fork (SDK 56).**
- "Most code imported directly from `@react-navigation/*` packages will no longer work out of the box alongside expo-router" ([P56](https://expo.dev/changelog/sdk-56); codemod in [RTR](https://docs.expo.dev/router/migrate/sdk-55-to-56/)).
- From `expo-router@57.0.25`'s package.json: it no longer depends on `@react-navigation/*` (it now depends on `standard-navigation` + `react-native-screens ^4.26.0`).
- The CLI rewrite and check run only when `expo-router` resolves (expo/expo#45039).
- **Bearoom has no expo-router** (not in `package.json` or `node_modules`), so it **must do nothing here**. P56: "You can, of course, continue to use React Navigation".
- Keep `@react-navigation/*` on v7 (see §6). Just make sure nothing adds `expo-router` transitively.

**J. `expo prebuild` cleans by default in SDK 57** ("now clears and regenerates the native android and ios directories by default; pass --no-clean" [P57](https://expo.dev/changelog/sdk-57), #47209).
- **Bearoom impact:** `android/` (49 tracked files) and `ios/` (23 tracked files) are committed. Every customisation must therefore live in a config plugin. I found no hand edits outside the plugins; `android/app/build.gradle` uses debug signing only.
- **Fix:**
  1. Fix the plugins (K).
  2. Run `npx expo prebuild --clean`.
  3. Commit the regenerated dirs, or `.gitignore` them (full CNG). With 57's clean-by-default, keeping them committed only adds diff noise.

**K. Config-plugin fixes that hold for 54 → 57** (templates are unchanged from 56 → 57 per TPL-57, which I confirmed by diffing the 55.0.43 and 57.0.29 template tarballs: MainApplication/MainActivity/AppDelegate are identical).

`withBearoomPlayback.js` `withBearoomPlaybackMainApplication` (L142-169), replacing both merges:

```js
// import — anchor that exists in TPL-54/55/57
mergeContents({ tag: `${PLUGIN_NAME}-main-application-import`, src: contents,
  newSrc: `import ${pkg}.playback.BearoomPlaybackPackage`,
  anchor: /import expo\.modules\.ApplicationLifecycleDispatcher/, offset: 1, comment: "//" });
// package registration — TPL-54+: `PackageList(this).packages.apply {`
mergeContents({ tag: `${PLUGIN_NAME}-main-application-package`, src: contents,
  newSrc: `          add(BearoomPlaybackPackage())`,
  anchor: /PackageList\(this\)\.packages\.apply \{/, offset: 1, comment: "//" });
```

- `withBearoomPlaybackMainActivity` (L171-219) needs no change. Its anchors (`import expo.modules.ReactActivityDelegateWrapper` and `/^\s+\)\{\}\)$/`) exist verbatim in TPL-54/55/57 `MainActivity.kt` L11 and L40.
- `withBearoomPlaybackGradle` (`dependencies {`) and `withBearoomProguard` (`# Add any project specific keep options here:`) anchors still exist in TPL-57.
- **Better option:** turn `plugins/bearoom-playback` into a local Expo module (`modules/bearoom-playback` + `expo-module.config.json`) so autolinking registers it and the MainApplication mod disappears.

`plugins/with-fmt-xcode-fix.js:56`:

```js
anchor: /:ccache_enabled => ccache_enabled\?\(podfile_properties\),/,   // TPL-54/55/57 Podfile L60/L60/L64
offset: 2,
```

- Also raise `15.1` to `16.4` (H).
- All config-plugin APIs used still exist in `@expo/config-plugins@57.0.10`: `withPodfile`, `withMainApplication`, `withMainActivity`, `withAndroidManifest`, `withAndroidColors`, `withAppBuildGradle`, `withDangerousMod`, `createRunOncePlugin`, `build/utils/generateCode` (`mergeContents`) and `build/android/Colors` (`assignColorValue`). P56 notes no API changes.
- Optional: import from `expo/config-plugins` instead of the hoisted `@expo/config-plugins`, which is not a direct dependency.

**L. iOS scene life cycle (Xcode 27 / iOS 27).**
- Add to `app.json` plugins: `["expo-build-properties", { "ios": { "enableSceneSupport": true } }]`.
- "Requires Expo SDK 57.0.23 or newer … Only the standard SDK 57 Swift AppDelegate template is supported" ([BP](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/); CL:expo-build-properties 57.0.19/57.0.20; [SCENE](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27)).
- This matches `docs/project-board.md:324-327`.
- After enabling it, re-test deep links (`bearoom://`, legacy `netprime://`) on iOS, because URL handling moves to the scene delegate.

**M. TypeScript 6.0.3** (installed by `expo install --fix` from SDK 56; opt out with `expo.install.exclude` [P56](https://expo.dev/changelog/sdk-56)). TS 6 defaults `types` to `[]` and `strict` to true, and deprecates `baseUrl` ([TS6](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)).
- **Bearoom impact:**
  - `tsconfig.json` has no `types`. That loses the jest globals in the 4 `*.test.ts` files and the `process` global (from `@types/node`) used in `contexts/movieContext/movieContext.tsx`, `services/gifs.ts`, `services/supabase.ts` and `src/store/services/workerApi.ts`.
  - `strict: true` is already set; there is no `baseUrl` (`paths` only), which is fine.
  - `expo/tsconfig.base` changes `jsx` to `react-jsx` (verified in `expo@57.0.27/tsconfig.base.json`); no impact.
- **Fix:** add `"types": ["jest", "node"]` to `compilerOptions`. Alternatively add an `expo-env.d.ts` with `/// <reference types="expo/types" />` for `process.env`, which is gitignored at `.gitignore:9`. Then run `npx tsc --noEmit`.

**N. ESLint: eslint-config-expo 56.0.4+ moves to `eslint-plugin-react-hooks` ^7** (CL:eslint-config-expo).
- `eslint-config-expo@57.0.2/flat/utils/react.js` spreads `pluginReactHooks.configs.recommended.rules`. In v7, `recommended` enables all React Compiler rules ([RHL](https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/CHANGELOG.md) 7.0.0): `refs`, `set-state-in-effect`, `set-state-in-render`, `purity`, `immutability`, `static-components`, `preserve-manual-memoization`, `incompatible-library`, …
- **Bearoom impact:**
  - `eslint.config.js` (flat config, `eslint-config-expo/flat`) still works unchanged.
  - Expect many new errors in the ref-heavy player/party code (`HijackPlayer.tsx`, `PartyScreen.tsx`, `PlayerControls.tsx`).
  - The 8 existing `// eslint-disable-next-line react-hooks/exhaustive-deps` lines keep working.
  - `expo lint` is not in CI (`Main.yml` only builds), so this does **not** block a build.
- **Fix:** temporarily downgrade the compiler rules to `"warn"` in `eslint.config.js`. Note that the React Compiler itself is not enabled; it is only on in the default *template* ([P54](https://expo.dev/changelog/sdk-54)), and `app.json` has no `experiments.reactCompiler`.

**O. Node / CI.**
- [VER](https://docs.expo.dev/versions/latest/) lists Node 22.13.x for SDK 57. RN 0.86's `engines` field still allows `^20.19.4 || ^22.13.0 || ^24.3.0 || >=25`.
- **Fix:** bump `.github/workflows/Main.yml:23` to `'22'`. JDK 17 (`:28`) is fine for Gradle 9.3.1 / AGP 8.12 (TPL-57 wrapper; RN `libs.versions.toml`).

**P. Smaller SDK 56/57 items that do not affect Bearoom.**
- expo-file-system `copy()`/`move()` become async; not used.
- expo-clipboard `setString` removed; not installed.
- expo-updates diffing on by default; not installed.
- Metro: on-demand filesystem, and Node's native watcher replaces Watchman ([P56](https://expo.dev/changelog/sdk-56)).
- RN 0.86 has "no user-facing breaking changes" ([B86](https://reactnative.dev/blog/2026/06/11/react-native-0.86)). Behaviour notes:
  - Modal now forwards `style` to its inner container. Check the `BearAlert`, `PartyTray`, `GifPicker` and `PlayerSettingsSheet` Modals visually.
  - `Image.getSize` returns the true source size.
  - Views with non-invertible transforms (`scaleX: 0`) no longer receive touches.
- RN 0.85: ScrollView `nestedScrollEnabled` defaults to true when a `refreshControl` is set; `Pressable` keeps its listeners inside a hidden `<Activity>` ([B85](https://reactnative.dev/blog/2026/04/07/react-native-0.85)).

**Q. React 19.2 and `forwardRef`.**
- `forwardRef` "will be deprecated in a future release". It does not warn in 19.2 ([FWD](https://react.dev/reference/react/forwardRef)).
- The 5 sites keep working: `components/player/ProviderSheet.tsx:82`, `EpisodeSheet.tsx:58`, `HijackPlayer.tsx:134`, `HijackPlayer.web.tsx:38`, `PlayerControls.tsx:101`.
- Optional modernisation: use `ref` as a prop.
- No `element.ref` reads (the `item.ref` hits at `PartyQueueList.tsx:28,114` are a data field), no `defaultProps`, no string refs.

---

## 5. Patches (patch-package)

### 5.1 `patches/@gorhom+bottom-sheet+5.2.14.patch`

- **What it fixes:**
  - `useAnimatedLayout` registers `Dimensions.addEventListener('change', …)` in a `useEffect` and never removes it. Every mount/unmount of a sheet (the Provider, Episode, Room settings and Player settings sheets) leaks a listener that keeps writing `state.window` after unmount.
  - The patch keeps the subscription and returns `() => subscription.remove()`. It also renames the shadowed `window` parameter to `win`.
  - It patches `lib/commonjs`, `lib/module` and `src` `hooks/useAnimatedLayout.(js|ts)`. The commit is `8fbd13b` ("gorhom rotation patch").
- **Upstream status: not fixed.**
  - 5.2.14 is still the latest release.
  - `src/hooks/useAnimatedLayout.ts` at the v5.2.14 tag is identical on master: still no stored subscription, no cleanup, and `window` still shadowed ([v5.2.14 source](https://raw.githubusercontent.com/gorhom/react-native-bottom-sheet/v5.2.14/src/hooks/useAnimatedLayout.ts)).
  - Reanimated 4 has been supported since [v5.1.8](https://github.com/gorhom/react-native-bottom-sheet/releases/tag/v5.1.8). The peer range is `react-native-reanimated >=3.16.0 || >=4.0.0-`, `react-native-gesture-handler >=2.16.1`.
- **Action:** keep the patch unchanged. The package version does not change, so the patch filename stays valid. Re-test sheet rotation on Player/Party after Reanimated 4.

### 5.2 `patches/react-native-webview+13.13.5.patch`

- **What it does:** this is a Bearoom feature, not a bug fix, so it will **never** be upstream.
  - It adds `android/.../AlwaysVisibleRNCWebView.kt`, a `RNCWebView` subclass. While `forceWindowVisible` is set, it reports the window as `VISIBLE` (`onWindowVisibilityChanged`, `dispatchWindowVisibilityChanged`, `onVisibilityChanged`) and refuses a 0×0 `onSizeChanged`.
  - In `RNCWebViewManagerImpl.createRNCWebViewInstance` it changes `return RNCWebView(context)` to `return AlwaysVisibleRNCWebView(context)`.
  - The aim is to keep Chromium decoding after Home, for background/PiP playback. Commits: `8c73792`, `b628d3f`.
- **Hard compile dependency:** `plugins/bearoom-playback/android/src/playback/BearoomWebViews.kt:7` imports `com.reactnativecommunity.webview.AlwaysVisibleRNCWebView` and uses it at `:28`. If the patch does not apply, the Android build fails to compile.
- **Will it apply to 13.16.1? Yes, very likely.**
  - At v13.16.1, `RNCWebViewManagerImpl.kt` L62-63 is still exactly `fun createRNCWebViewInstance(context: ThemedReactContext): RNCWebView {` / `return RNCWebView(context)`. The file changed only near L95 and L716 between 13.13.5 and 13.16.1, so the `@@ -60,7` hunk context is identical.
  - `RNCWebView.java` is still `public class RNCWebView extends WebView` with a `RNCWebView(ThemedReactContext)` constructor, and it overrides `onSizeChanged`. The visibility methods are inherited and non-final ([RNCWebViewManagerImpl.kt @ v13.16.1](https://raw.githubusercontent.com/react-native-webview/react-native-webview/v13.16.1/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewManagerImpl.kt), [RNCWebView.java @ v13.16.1](https://raw.githubusercontent.com/react-native-webview/react-native-webview/v13.16.1/android/src/main/java/com/reactnativecommunity/webview/RNCWebView.java)).
- **Action:**
  1. After `npx expo install react-native-webview` (13.15.0 at SDK 54, 13.16.0 at 55, 13.16.1 at 57), run `npx patch-package` to check it applies.
  2. Regenerate it as `react-native-webview+13.16.1.patch`. patch-package warns on a version mismatch, and the filename must match to stay clean.
  3. Re-test the Home → background playback keep-alive on a release build.
- **Behaviour note:** 13.16.0 reverts the `setIgnoreErrFailedForThisURL` workaround (#3831) ([releases](https://github.com/react-native-webview/react-native-webview/releases)). Spurious Android `onReceivedError` calls are no longer suppressed, and `HijackPlayer.tsx`'s `onError` → error-recovery overlay / auto-retry (`HijackPlayer.tsx:640`) could start firing on harmless errors (e.g. ad/download sub-requests).
  - Device-check that the "Try another source" overlay does not appear spuriously.
  - The iOS-only `injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}` (`HijackPlayer.tsx:618`) is what the videasy all-frames bridge depends on. I found no release note that changes it, but re-verify the iOS bind ([[verify-hijack-bind]]).
- **Beyond SDK 57:** 14.0 needs Android API 24+, and 16.0 removes Paper. Stay on 13.16.1 to match SDK 57.

---

## 6. Third-party compatibility (RN 0.86 / React 19.2 / New Architecture only / SDK 57)

Expo-managed packages use the SDK 57 BNM pins from §1. The table covers the packages Expo does not manage, plus pins where the app deviates from Expo.

| Package | Now | Needed for RN 0.86 / SDK 57 | Verdict | Notes | Source |
|---|---|---|---|---|---|
| @react-navigation/native | ^7.1.6 (7.3.16 installed) | ^7.5.0 (latest v7) | **bump (in v7)** | Peer react ≥18.2, RN `*`. v8 is still alpha (8.0.0-alpha.5x) and needs screens ≥4.25 and gesture-handler ≥3, so stay on v7. SDK 56's React Navigation fork affects only expo-router apps (§4.I) | [npm](https://registry.npmjs.org/@react-navigation/native), [getting-started](https://reactnavigation.org/docs/getting-started/), [v8 progress](https://reactnavigation.org/blog/2026/07/08/react-navigation-8.0-july-progress), [P56](https://expo.dev/changelog/sdk-56) |
| @react-navigation/native-stack | ^7.18.8 | ^7.20.0 | **bump** | Peer screens ≥4.0.0, sac ≥4.0.0. Native-stack options used: `headerShown`, `animation` (`slide_from_right`/`fade`/`slide_from_bottom`), `gestureEnabled` (`RootNavigator.tsx:19-36`, `PlayerNavigator.tsx:15-32`), all unchanged. The `statusBar*`/`navigationBar*` options are no-ops on Android since screens 4.17, but the app does not use them | [npm](https://registry.npmjs.org/@react-navigation/native-stack), [screens 4.17 #3264](https://github.com/software-mansion/react-native-screens/releases) |
| @react-navigation/bottom-tabs | ^7.3.10 (7.4.2) | ^7.20.0 | **bump** | — | [npm](https://registry.npmjs.org/@react-navigation/bottom-tabs) |
| @react-navigation/elements | ^2.3.8 (2.9.38) | ^2.9.44 | **bump or remove** | Never imported by app code | [npm](https://registry.npmjs.org/@react-navigation/elements) |
| react-native-screens | ~4.11.1 | ~4.26.0 | bump (Expo pin) | 4.25 drops the legacy architecture; 4.26 needs RN ≥0.84 Fabric | [README 4.26.2](https://raw.githubusercontent.com/software-mansion/react-native-screens/4.26.2/README.md), [4.25.0](https://github.com/software-mansion/react-native-screens/releases/tag/4.25.0) |
| react-native-safe-area-context | 5.4.0 | ~5.7.0 | bump (Expo pin) | No breaking changes from 5.4 to 5.10 | [releases](https://github.com/AppAndFlow/react-native-safe-area-context/releases) |
| react-native-gesture-handler | ~2.24.0 | ~2.32.0 | bump (Expo pin) | v2.32.0 "Support React Native 0.86". `Gesture.Pan().runOnJS(false)` is unchanged. v3 is not required | [v2.32.0](https://github.com/software-mansion/react-native-gesture-handler/releases/tag/v2.32.0) |
| react-native-reanimated (+ worklets) | ~3.17.4 | 4.5.1 + worklets 0.10.1 (4.5.5 recommended) | **bump (major)** | RN 0.86 is supported by 4.4–4.8. `runOnJS` is deprecated in favour of `scheduleOnRN`. Spring default mass is now 4 | [compatibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/), [migration](https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x/) |
| @shopify/flash-list | 1.7.6 | 2.0.2 (2.3.3 latest, pure JS) | **bump (major)** | See 54-7 | [v2-migration](https://shopify.github.io/flash-list/docs/v2-migration), [releases](https://github.com/Shopify/flash-list/releases) |
| @gorhom/bottom-sheet | ^5.2.14 | 5.2.14 (latest) | **OK + keep patch** | Supports Reanimated 4 since 5.1.8. The patch is still needed (§5.1) | [v5.1.8](https://github.com/gorhom/react-native-bottom-sheet/releases/tag/v5.1.8), [useAnimatedLayout @ v5.2.14](https://raw.githubusercontent.com/gorhom/react-native-bottom-sheet/v5.2.14/src/hooks/useAnimatedLayout.ts) |
| react-native-webview | 13.13.5 (patched) | 13.16.1 | **bump + re-create patch** | §5.2 | [releases](https://github.com/react-native-webview/react-native-webview/releases) |
| @sbaiahmed1/react-native-blur | ^4.7.1 | 6.0.2 recommended | **bump (verify)** | 4.7.1 on RN 0.86 is UNVERIFIED. It uses deep `react-native/Libraries/…` codegen imports (fine through 0.86, a TS error in 0.87) and carries the shadowed-ivar crash that 6.0.1 fixes for RN 0.87. 5.0 is Fabric-only and changes the Android `BlurSwitch` strength. The app uses only `BlurView` (`src/ui/Frost.tsx:15,26-28`). Re-run the low-end stutter checks ([[playback-stutter-is-dimezis-blur]]) | [v5.0.0](https://github.com/sbaiahmed1/react-native-blur/releases/tag/v5.0.0), [v6.0.0](https://github.com/sbaiahmed1/react-native-blur/releases/tag/v6.0.0), [v6.0.1](https://github.com/sbaiahmed1/react-native-blur/releases/tag/v6.0.1) |
| react-native-mmkv | ^4.3.1 | 4.3.2 | **bump (minor)** | Needs nitro ≥0.35.0. API used: `createMMKV()` (`services/storage/universalStorage.ts:5,11`), unchanged | [v4.2.0](https://github.com/mrousavy/react-native-mmkv/releases/tag/v4.2.0), [v4.3.2](https://github.com/mrousavy/react-native-mmkv/releases/tag/v4.3.2) |
| react-native-nitro-modules | ^0.35.9 | ≥0.35.9 (latest 0.37.1) | **OK** | Minimum RN 0.75, no upper bound. Keep a single copy. Using 0.37 with mmkv code generated by nitrogen 0.35.9 is UNVERIFIED, so stay on 0.35.x unless mmkv bumps | [min requirements](https://nitro.margelo.com/docs/minimum-requirements), [v0.36.2](https://github.com/mrousavy/nitro/releases/tag/v0.36.2) |
| react-native-fs | ^2.20.0 | — | **remove** | Unused (no imports). Last release 2022; legacy bridge module that works only through interop. If ever needed: expo-file-system, or `@dr.pogodin/react-native-fs` | [npm](https://registry.npmjs.org/react-native-fs), [@dr.pogodin README](https://raw.githubusercontent.com/birdofpreyru/react-native-fs/master/README.md) |
| react-native-shimmer-placeholder | ^2.0.9 | 2.0.9 | **OK (pure JS)** | Its peer `react-native-linear-gradient` gets autolinked from SDK 54, so exclude it (54-16) | [repo](https://github.com/tomzaku/react-native-shimmer-placeholder), [P54](https://expo.dev/changelog/sdk-54) |
| react-native-linear-gradient (transitive peer) | 2.8.3 | — | **exclude from autolinking** | Unused; see 54-16 | [P54](https://expo.dev/changelog/sdk-54) |
| react-native-url-polyfill | ^4.0.0 | 4.0.0 | OK | Pure JS, peer RN `*` | [releases](https://github.com/charpeni/react-native-url-polyfill/releases) |
| react-native-get-random-values | ~1.11.0 | ~1.11.0 (Expo pin) | OK | Bridgeless-ready since 1.11. 2.0.0 is a TurboModule (RN ≥0.81) and optional | [v2.0.0](https://github.com/LinusU/react-native-get-random-values/releases/tag/v2.0.0) |
| react-native-keyboard-controller | ^1.22.3 | 1.21.9 (Expo pin) or keep 1.22.x | **OK (keep 1.22.x)** | 1.21.9 "Preparing for upcoming RN 0.86"; 1.22.x carries those fixes, with no breaking changes. `<KeyboardProvider preload={false}>` (`App.tsx:115`) is valid. Add to `expo.install.exclude` | [1.21.9](https://github.com/kirillzyusko/react-native-keyboard-controller/releases/tag/1.21.9), [KeyboardProvider](https://kirillzyusko.github.io/react-native-keyboard-controller/docs/api/keyboard-provider) |
| @react-native-community/netinfo | 11.4.1 | 12.0.1 (Expo pin) | bump | 12.0 sets iOS 14 as the minimum and makes SSID need an entitlement; the app does not read the SSID (`hooks/useConnectivity.ts`, `src/store/index.ts:3`, `utils/connectivity.ts`) | [v12.0.0](https://github.com/react-native-netinfo/react-native-netinfo/releases/tag/v12.0.0) |
| @expo/vector-icons | ^14.1.0 | ^15.0.2 | **bump; now required as a direct dependency** | §4.E | [P56](https://expo.dev/changelog/sdk-56), [#341](https://github.com/expo/vector-icons/pull/341) |
| @expo-google-fonts/inter, /outfit | ^0.4.2 / ^0.4.3 | latest already | OK | No peer deps | [npm](https://registry.npmjs.org/@expo-google-fonts/inter) |
| use-sync-external-store | ^1.5.0 | ^1.7.0 | OK | Peer react ≤ ^19 | [npm](https://registry.npmjs.org/use-sync-external-store) |
| @supabase/supabase-js, @reduxjs/toolkit, react-redux | — | — | OK (JS) | Only exposure is the `expo/fetch` global (§4.D) | [P56](https://expo.dev/changelog/sdk-56) |
| expo-blur | ~14.1.5 | — | **remove** | Unused; 55 changes its Android API | [P55](https://expo.dev/changelog/sdk-55) |
| expo-build-properties | — | ~57.0.22 | **add** | `ios.enableSceneSupport` | [BP](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/) |
| @react-native/jest-preset | — | 0.86.3 (dev) | **add** | Required by jest-expo 57 | [B85](https://reactnative.dev/blog/2026/04/07/react-native-0.85) |
| execbro-sdk (dev) | ^0.6.0 | — | remove (optional) | Replaced by metro-mcp ([[metro-mcp-replaces-execbro]]) | — |

---

## 7. Risk list (highest first)

| # | Risk | Likelihood / impact | Where | Mitigation |
|---|---|---|---|---|
| 1 | **Config plugins throw `ERR_NO_MATCH` on clean prebuild.** Native dirs cannot be regenerated; SDK 57 prebuild cleans by default | Certain / blocks Android and iOS builds | `withBearoomPlayback.js:151,161`; `with-fmt-xcode-fix.js:56` | Re-anchor per §4.K before the first `--clean` (at the 54 step) |
| 2 | **WebView patch fails to apply.** `BearoomWebViews.kt` fails to compile and background playback is lost | Low (the hunk context is unchanged at 13.16.1) / blocks Android build | `patches/react-native-webview+13.13.5.patch`; `BearoomWebViews.kt:7,28` | Re-generate as `+13.16.1.patch`; release-build keep-alive test |
| 3 | **iOS 27 launch crash** without the scene lifecycle | Certain on Xcode 27 / iOS can't launch | `app.json` plugins; `docs/project-board.md:324-327` | expo ≥57.0.23 + `expo-build-properties` `ios.enableSceneSupport: true` on a regenerated SDK 57 AppDelegate; then re-test `bearoom://` and `netprime://` deep links |
| 4 | **`StyleSheet.absoluteFillObject` removed (RN 0.85)**: overlays silently lose absolute positioning | Certain / visible UI breakage, player loading/buffer overlays included | 9 sites (§4.B) | Replace with `StyleSheet.absoluteFill`. `tsc` flags all of them |
| 5 | **Reanimated 4 + layout animations on the New Architecture** (the documented PropsRegistry crash class) and spring feel changes | Medium / crash when leaving Party/Join/Person screens | `PartyScreen.tsx:766-767,893-894`, `JoinPartyScreen.tsx:144`, `PersonDetailsScreen.tsx:161` | Remove (project rule) or use Reanimated 4.5.5; release-build test |
| 6 | **`expo/fetch` as global fetch (56)** changes networking semantics: `Request` objects, abort, redirects, compression | Medium / config/TMDB/Supabase/GIFs regress; scrapers' `redirect:'manual'` behaviour changes | `workerApi.ts:26`, `fetchWithTimeout.ts:21-24`, `gifs.ts:96-159`, `checkGithubRelease.ts:12`, supabase-js | Smoke-test; fall back to `EXPO_PUBLIC_USE_RN_FETCH=1` |
| 7 | **Hermes V1 default**: memory regression with worklets (fixed in 57.0.9); `eval` scope rules | Medium if expo < 57.0.9 / OOM; Low for current code (no eval) | Whole app; future on-device scrapers | Pin expo ≥57.0.23; device-test `new Function` before relying on it; opt out only with `useHermesV1:false` + build from source |
| 8 | **WebView 13.16.0 stops suppressing spurious Android `onReceivedError`** | Medium / false "source failed" overlays and auto-retries | `HijackPlayer.tsx:640` `onError` | Device QA on videasy/vidfast; filter non-main-frame errors |
| 9 | **FlashList v2 layout and `maintainVisibleContentPosition` default** | Medium / search grid spacing, jumping on new queries | `SearchView.tsx:270-289`, `GridItem.tsx:9-10` | Remove `estimatedItemSize`; disable MVCP; visual QA |
| 10 | **Transitive autolinking links unused `react-native-linear-gradient` 2.8.3** | Medium / possible native build failure or a dead old-style view manager | `package-lock.json:12648` | `expo.autolinking.exclude` |
| 11 | **`@sbaiahmed1/react-native-blur` 4.7.1 untested on RN 0.86**; a bump to 6.x changes the Android blur implementation | Medium / build failure or frame-stutter regression | `src/ui/Frost.tsx` | Try 4.7.1 first; if it fails, 6.0.2 + stutter re-test on low-end |
| 12 | **Tooling**: jest preset missing; TS 6 `types: []`; eslint react-hooks v7 errors; Node 22 | Certain / tests and `tsc` fail; lint noise | `package.json` jest; `tsconfig.json`; `eslint.config.js`; `Main.yml:23` | Add `@react-native/jest-preset`; `"types": ["jest","node"]`; downgrade compiler rules to warn; Node 22 in CI |
| 13 | **`@expo/vector-icons` 15 glyph changes** (Ionicons visuals) | Low–Medium / wrong or missing icons | 41 Ionicons imports | `tsc` + visual pass |
| 14 | **Edge-to-edge insets** on the tab bar, PartyTray and keyboard views (already opted in, but RN 0.81/0.86 change Modal/StatusBar/KAV handling) | Low / layout overlap | `PartyTray.tsx:177-180`, `GifPicker.tsx`, `src/ui/FloatingTabBar` | Device pass on Android 15/16 |
| 15 | **Legacy `ReactPackage` module** relies on the TurboModule interop layer | Low (kept in 0.86) / background-playback controls break if interop is ever removed | `BearoomPlaybackPackage.kt`, `BearoomPlaybackModule.kt` | Migrate to `BaseReactPackage` or a local Expo module (also removes risk 1's MainApplication edit) |

---

## 8. Suggested execution order

**0. Pre-work, on SDK 53 (each item verifiable before any bump):**
- Replace the 9 `absoluteFillObject` sites.
- Remove the 4 Reanimated layout-animation usages.
- Remove `estimatedItemSize`.
- Drop `translucent` from `<StatusBar>`.
- Remove `react-native-fs`, `expo-blur`, `execbro-sdk`.
- Add `.catch` to the `void fetch`es.
- Re-anchor both config plugins per §4.K.
- Add `expo.install.exclude: ["react-native-keyboard-controller"]` and `expo.autolinking.exclude: ["react-native-linear-gradient"]` to `package.json`.

**1. SDK 54:**
- `expo@~54.0.37`, `expo install --fix`, add `react-native-worklets`.
- `npx patch-package` (check both patches).
- `npx expo prebuild --clean`.
- Android release build: test playback keep-alive, sheets, the search grid and party screens.
- Commit.

**2. SDK 55:**
- `expo@~55.0.31`, `--fix`.
- Delete `newArchEnabled` and `edgeToEdgeEnabled` from `app.json`.
- `prebuild --clean` (the MainApplication import anchor matters from here).
- Android test. Commit.

**3. SDK 57:**
- `expo@~57.0.27` (≥57.0.23), `--fix`.
- Add `expo-build-properties` (`ios.enableSceneSupport: true`), `@react-native/jest-preset@0.86.3`, `@expo/vector-icons@^15`.
- TS 6: add `types`.
- Regenerate the webview patch for 13.16.1.
- `prebuild` (cleans by default).
- `npx tsc --noEmit`, `npm test`, `expo lint` (warn-only compiler rules).
- Then:
  - iOS simulator launch on Xcode 27.
  - Android release build.
  - `expo/fetch` smoke test.
  - A Hermes V1 `new Function` probe.
  - The [[verify-hijack-bind]] check on iOS.
- CI to Node 22.

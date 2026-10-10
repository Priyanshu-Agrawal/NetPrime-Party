# Vega and CloudStream: source teardown for Bearoom (2026-10-10)

**Scope:** a read-only source teardown of the two closest competitors, focused on what transfers to Bearoom
(RN 0.79 / Expo SDK 53, iOS + Android, watch party). Nothing was cloned or run. Files were read as text through
`raw.githubusercontent.com`, `unpkg.com` and GitHub web pages. I made three unauthenticated `api.github.com` calls (repo
info, then the vega-app tree). The third, for the CloudStream tree, hit the exhausted shared 60/h limit, so CloudStream was
read through raw files and web tree listings.
**Read first, not repeated here:** `docs/research/similar-apps-architecture-2026-10.md` (Nuvio, Cove, kunai, Streamyfin,
Stremio, sync systems, expo-video facts) and `docs/research/plugin-catalog-measurement-2026-10.md`.
**Pinned commits:**
- vega-app [`956673e8`][V] (2026-10-10, v5.0.3)
- vega-providers [`319931d1`][P] (2026-10-10)
- cloudstream [`4846fbac`][C] (2026-10-09)
- react-native-video 6.19.2 from unpkg

**Labels:** a claim with no tag was read in source at the cited line. **(inferred)** marks my reasoning, and
**(untested)** marks something that needs a device test.

---

## 0. Summary

1. **Vega is Android-only, so it says nothing about iOS.**
   - Releases ship a single APK ([v5.0.2 assets][V-rel]).
   - There is no `ios/` folder in the tree.
   - All 20+ native modules live in `native-src/android/`.
   - `ToastAndroid` is called 14 times in `Player.tsx`.
   - The 3,311-line react-native-video patch touches only Android and TypeScript files.
   - `app.config.js` lists `platforms: ['ios','android']` ([L199][V-appcfg-plat]), but nothing iOS-specific is maintained.
2. **Vega's provider host is the closest existing match to what Bearoom planned, and it is more hardened than Nuvio's:**
   - one hidden WebView with a CSP of `connect-src 'none'`;
   - a fresh Web Worker per call, with ambient network globals deleted;
   - all network traffic goes through RPC to a native (OkHttp) fetch that re-validates every redirect hop against private
     addresses;
   - a per-domain token-bucket rate limiter;
   - cookie jars and key-value storage scoped per source author;
   - a visible WebView dialog for WAF challenges;
   - host-side injection of jar cookies into each returned stream's `headers.Cookie`.

   That last item solves exactly Bearoom's MovieBox Cookie-gated DASH problem.
3. **Vega's stream contract is weak.**
   - `{server, link, type: string, quality?, tag/tags?, subtitles?, headers?: any, skip?}`.
   - There is no language field. Language lives in free text (server names, link titles).
   - `type` isn't normalised: one provider returns `"dash"`, but the player only maps `"m3u8"`/`"mpd"`.

   CloudStream's `ExtractorLink` is tighter:
   - a typed `ExtractorLinkType` enum with URL inference;
   - an integer `quality` with an `Unknown` sentinel;
   - `referer` kept separate from `headers`;
   - separate `audioTracks[]` files, a DRM subclass, and a concatenated-playlist subclass.

   It **also has no language field on the link.**
4. **Neither app represents a dub as structured data at the stream level.** They handle language in three ways:
   - (a) at the provider level: a region tag in Vega's manifest; `lang` in CloudStream's `MainAPI` and `SitePlugin`;
   - (b) at the link or server level, as free text, e.g. MovieBox Web returns one `Link` per dub;
   - (c) as in-stream audio tracks switched by language, with a single sticky preferred language.

   CloudStream adds a rule worth copying: **apply the saved language only if the stream has it**. Its own comment says
   applying it blindly caused "audio track init failed".
5. **Player verdict:**
   - **On Android,** Vega shows what react-native-video (RNV) plus ExoPlayer can do: per-stream headers on every segment,
     language-based audio switching, manual quality, sidecar subtitles, FFmpeg audio, and PiP. It needed a large native
     patch to get there, which fixed:
     - header-factory reuse across streams;
     - the shared cookie jar leaking cookies to stream hosts;
     - sidecar subtitles being "silently ignored";
     - no fallback when the AC-3 or E-AC-3 audio codecs aren't supported.
   - **On iOS,** RNV 6.19.2 uses the same `AVURLAssetHTTPHeaderFieldsKey` as expo-video, and it skips sidecar text tracks
     for `.m3u8`. Its only real iOS advantages over expo-video on SDK 53 are a **caller-set seek tolerance** (precise
     seeks for sync) and `maxBitRate` → `preferredPeakBitRate`.
   - **Conclusion:** Vega is not evidence against expo-video for Bearoom. It is mild evidence that an RNV Android adapter
     could be a later option behind the `PlayerEngine` contract (§3d).
6. **Neither app has watch-party or playback sync.**
   - Vega's "sync" is a file-based library and history manifest in a shared folder.
   - CloudStream's `SyncAPI` covers trackers only: AniList, MAL, Kitsu, Simkl and a local list.
7. **Licences:**
   - Vega app: **PolyForm Noncommercial 1.0.0** after commit `9ccc0c8` (2026-10-02); Apache-2.0 up to and including
     `9ccc0c8`.
   - vega-providers: `"license": "ISC"` in `package.json`, but there is no LICENSE file.
   - CloudStream: **GPL-3.0**.

   Bearoom can safely **re-implement patterns**. Copying code is only clean from the **Apache-2.0 snapshot of Vega
   (≤ `9ccc0c8`)**, with attribution. The current Vega code can't go into a product that has ads or charges, and
   CloudStream code would force GPL on Bearoom.

---

## 1. Vega (vega-org/vega-app + Zenda-Cross/vega-providers)

### 1.1 Licence
- [LICENSE][V-lic] and [NOTICE][V-notice] say the code has been PolyForm Noncommercial 1.0.0 since after commit `9ccc0c8`
  (2026-10-02). It defines commercial use as "selling the app or its code, charging for access, showing ads, or using it
  in a commercial product".
- Versions **up to and including `9ccc0c8` stay Apache-2.0**. Third-party contributions stay Apache-2.0 under their
  authors' copyright.
- **What Bearoom can use:**
  - Reading the code and re-implementing the ideas is fine; copyright protects code, not architecture.
  - Copying code is clean only from the Apache-2.0 snapshot (≤ `9ccc0c8`), keeping NOTICE and attribution.
    **(inferred)** That snapshot is eight days old, so most of the sandbox described below probably already exists in
    it. Check the specific file at `9ccc0c8` before copying anything.
  - Code from the current PolyForm head can't ship in a monetised Bearoom (ads or IAP).
- **vega-providers:** there is no LICENSE file; `package.json` says `"license": "ISC"` ([package.json#L5][P-pkg]).
  **(inferred)** That is a weak grant. Treat provider code as reference only.

### 1.2 Provider distribution, update and pinning
- **Source = a git repo or any https folder.**
  - `createProviderSource` turns `author`, `author@cb|bb|gl` or a repo/raw URL into
    `https://raw.githubusercontent.com/{author}/vega-providers/refs/heads/{branch}`, defaulting to `main`
    ([helpers.ts#L17][V-help-repo], [L44-L56][V-help-raw]).
  - Codeberg, Bitbucket and GitLab are also supported. Any other https URL counts as a custom manifest folder.
  - The default source is seeded as `Zenda-Cross` ([ExtensionManager.ts#L511-L519][V-ext-init]).
  - Private repos send a token header ([`sourceTokenStorage`][V-ext-dl]).
- **Manifest:** `manifest.json` is an array of `{display_name, value, version, icon, type, disabled, hasSettings, path?}`
  ([ExtensionManager.ts#L142-L236][V-ext-manifest]).
  - `type` is a region or category tag (`global`/`english`/`india`/`anime`/`italy`).
  - `disabled` is a remote kill switch.
  - A `path` that escapes the source folder is rejected ([helpers.ts#L267-L300][V-help-path]).
- **Modules:** six files per provider, `dist/{value}/{posts,meta,stream,catalog}.js` plus optional `episodes`/`settings`.
  Each is downloaded with `?t=Date.now()` and no-cache headers, then cached in MMKV
  ([ExtensionManager.ts#L241-L328][V-ext-dl]). Missing required files fail the install.
- **Updates:**
  - A provider counts as outdated when the manifest `version` differs from the installed one, by plain string
    inequality ([extensionStorage.ts#L467-L482][V-extst-upd]).
  - The manifest cache lasts 24 h ([L457-L462][V-extst-upd]).
  - Auto-update runs at startup and then every 6 h ([UpdateProviders.ts#L17][V-upd-int],
    [L211-L262][V-upd-auto]).
  - There is **no hash, no signature and no commit pin.** A raw `refs/heads/` URL always follows branch head, and
    there's no way to pin a commit SHA for a GitHub source.
  - Contrast: CloudStream checks a SHA-256 per file (§2.4).
- **Other ways in:** a dev "test mode" pulls from a local server ([L330-L403][V-ext-test]). An Android intent
  `vega.intent.action.ADD_SOURCE` with a `url` and optional `token` adds a source ([sourceIntent.ts][V-srcintent]).
- **Catalog size today:** 58 providers, 23 of them `disabled` → **35 live**. By type: global 34, english 11, india 8,
  anime 4, italy 1 ([manifest.json][P-manifest]).

### 1.3 Runtime and sandbox
| Layer | What it does | Source |
|---|---|---|
| Host WebView | Zero-size and invisible. `source={{html, baseUrl:'https://provider-sandbox.invalid/'}}`. Settings: `incognito`, `cacheEnabled=false`, `domStorageEnabled=false`, no file access, no third-party or shared cookies, `onShouldStartLoadWithRequest` allows only the sandbox origin, and it reloads on `onRenderProcessGone`/`onContentProcessDidTerminate`. CSP: `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; …` | [ProviderSandboxHost.tsx#L8-L19, L65-L89][V-host] |
| Document | Spawns **one Worker per invoke**, so no prototypes are shared between providers. Keeps one pre-warmed worker that has run no provider code. Calls `terminate()` on timeout, the only way to stop a `while(true)`. Fails closed if Worker creation fails. | [sandboxDocument.ts#L57-L79, L95-L151][V-doc] |
| Worker | Sets `fetch, XMLHttpRequest, WebSocket, EventSource, postMessage, importScripts, Worker, SharedWorker, BroadcastChannel, indexedDB, caches, navigator` to `undefined`. Runs module code via `new Function('exports','module','require',…,'"use strict";'+code)` with those names also shadowed as `undefined` parameters, and `globalThis`/`self` too. `require` returns `{}`. | [sandboxWorker.ts#L61-L74, L285-L348][V-worker] |
| Bundled libraries | **axios** (with a custom adapter that sends everything through RPC fetch and keeps raw `Set-Cookie` pairs) and **cheerio**, both bundled into the worker by esbuild (`scripts/build-sandbox-runtime.mjs`). | [sandboxWorker.ts#L17-L18, L159-L232][V-worker-ax] |
| Transport | Frames go in through `injectJavaScript` as a JSON-quoted string literal, with U+2028/2029 escaped; there's a comment on why they dropped base64. Frames come back through `ReactNativeWebView.postMessage`. Each invoke is matched by a random token. | [sandboxBridge.ts#L99-L116][V-bridge-post] |
| Concurrency and timeouts | Up to **2 invokes run at once**; up to 64 can be pending. Queue wait is 60 s. Invoke timeout is **120 s**, with a native backstop at 125 s that **reloads the whole WebView**. If the sandbox hasn't signalled ready within 15 s, everything pending fails. Module size cap 2 MB, response cap 32 MB, provider state cap 256 KB. | [sandboxBridge.ts#L43, L79-L97, L129-L143, L260-L277][V-bridge]; [protocol.ts#L79-L82][V-proto] |
| State | Provider code can write `providerGlobal`. It is serialised back after each call and handed to the next invoke, kept in memory per `author/value`. | [sandboxWorker.ts#L381-L433][V-worker-state]; [ProviderManager.ts#L77-L134][V-pm-exec] |

**Host APIs a plugin gets (`providerContext`)**, from [sandboxWorker.ts#L251-L263][V-worker-ctx] and the type at
[types.ts#L281-L295][V-types-ctx]:
- `axios`, `cheerio`, and the global `fetch` (RPC-backed; supports `redirect:'manual'`);
- `commonHeaders`, a platform UA set sent with each invoke;
- `Crypto`, with only `digestStringAsync` (MD5/SHA-1/256/384/512, input ≤ 5 MB) and `getRandomBytesAsync` (≤ 1 KB) through
  RPC to `expo-crypto` ([providerRpc.ts#L111-L150][V-rpc-crypto]);
- `getBaseUrl(value)`, a 1 h cached base URL ([getBaseUrl.ts][V-baseurl]);
- `kvStore.get/set/delete/keys/clear`, persisted in MMKV and scoped to `author/value`; keys ≤ 256 chars, values ≤ 1 MB
  ([providerRpc.ts#L18-L109][V-rpc]);
- `getCookies(url)`;
- `openWebView(url, {headers, waitForCookie, force, timeoutMs, injectedJavaScript})`, which returns the rendered HTML,
  `cookies`, `cookieMap` and `userAgent`.

There is **no crypto-js or AES**; plugins bundle their own. Compare Bearoom's measured host requirement of a bare
`CryptoJS` global.

**Native fetch path** ([providerFetch.ts][V-fetch]):
- **On Android** it calls `NativeModules.ProviderHttpModule.fetch` with `redirect:'manual'` and **follows redirects in
  JS** ([L160-L275][V-fetch-and]). For every hop it:
  - runs `validateProviderUrl` (http/https only, no userinfo, no private, loopback, CGNAT or `.local`/`.internal` hosts;
    [urlGuard.ts#L77-L99][V-urlguard]);
  - turns 301/302/303 into GET where the spec says so;
  - drops `Authorization` when the host changes;
  - rebuilds `Cookie` from the jar for the new host.

  Limits: at most 10 redirects, 30 s per request. Header names and values containing CR or LF are rejected, and
  `Set-Cookie` can't be sent ([L21-L54][V-fetch-hdr]).
- **On iOS** (not shipped) it falls back to axios/XHR and fakes manual redirects by aborting on the first progress event
  ([L277-L330][V-fetch-ios]). **(inferred)** That fallback is the same "RN fetch ignores `redirect:'manual'`" gap Bearoom
  already hit, and Vega solved it only on Android, with a native module.
- **Rate limiting:** 20 requests/s plus a burst of 30 per **registrable domain** (via `tldts`); 12 in flight per host,
  48 overall; at most 20 s waiting in the queue and 64 queued per host ([rateLimiter.ts#L35-L42, L61-L66][V-rl]). That
  matches Bearoom's finding that "~15 hostnames share one backend that 429s"; Vega's domain buckets only partly address
  it.
- **Cookies** are a per-author jar (`providerCookieJar.ts`), deliberately kept apart from the native cookie store.

**WAF flow:**
- A plugin calls `openWebView(url, {waitForCookie:'cf_clearance'})`. A **visible** dialog opens; requests for the same
  site and cookie share one dialog. The resulting cookies land in that author's jar ([wafResolver.ts#L11-L38][V-waf]).
- On Android, `axios` 403/503 responses from Cloudflare also clear `cf_clearance` ([providerContext.ts#L10-L29][V-pctx]).

**Cookie into stream headers (the key pattern):**
- After `getStream`, the host adds the author's jar cookies for each stream URL as `headers.Cookie`, unless the
  provider already set one ([ProviderManager.ts#L372-L394][V-pm-cookie]).
- The comment explains why: "Provider requests no longer share the native cookie store with the player, so streams get
  their author's cookies (e.g. WAF clearance) as a header."

**Failure handling:**
- `getStream` runs under a **45 s** `AbortController` in `useStream` ([useStream.ts#L484-L505][V-us-fetch]), with
  react-query retry ×2 and exponential backoff capped at 10 s ([L542-L548][V-us-retry]).
- A non-array result throws ([ProviderManager.ts#L136-L148][V-pm-exec]).
- If the user excludes some qualities and that leaves nothing, the unfiltered list is used ([L495-L502][V-us-fetch]).
- A player error moves to the **next stream in list order** ([useStream.ts#L366-L376, L633-L657][V-us-next];
  [Player.tsx#L1742-L1772][V-pl-err]). There is no health tracking or ranking beyond the provider's own order.
- Diagnostics live in `providerDiagnostics.ts` (not read in depth).

**Hardcoded secrets in providers:** `vega/stream.ts` ships a fixed `cf_clearance` cookie and Edge UA in its request
headers ([vega/stream.ts#L5-L24][P-vega-stream]). **(inferred)** A Bearoom plugin-quality gate should flag hardcoded
`cf_clearance`.

### 1.4 Contract shape and why it differs from Bearoom's
- A Vega provider is a **whole site**, with `catalog`, `getPosts`, `getSearchPosts`, `getMeta` → `linkList`,
  `getEpisodes` and `getStream({link,type,isDownload})` ([types.ts#L113-L175][V-types-prov]; [README][P-readme]).
- **The input is the site's own link, not a TMDB id.** `Info.tmdbId/imdbId` are optional enrichment.
- Bearoom (and Nuvio/Stremio) ask "give me streams for TMDB X". Vega asks the user to browse inside one provider.
  **(inferred)** So Vega's host-and-sandbox layer transfers to Bearoom; its provider API doesn't.

### 1.5 Stream model (`getStream` → `Stream[]`)
From [types.ts#L30-L54][V-types-stream], identical in [vega-providers types.ts#L36-L46][P-types]:

| Field | Type | Notes |
|---|---|---|
| `server` | string | Display name. Usually carries **language and quality as text** ("Castle - Hindi - 1080P", "Hindi 1080P", "MX HLS 720") |
| `link` | string | Media URL |
| `type` | string | Free text: `m3u8`, `mp4`, `mkv`, `mpd`, **`dash`** (mxplayer, [L73-L76][P-mx]), `local`, torrent. The player only maps `m3u8` and `mpd` to the RNV `type` ([Player.tsx#L2809-L2810][V-pl-src]), so `dash` relies on the URL extension. |
| `quality` | `'360'…'2160'` or string | Label; excluded-quality filter |
| `tag` / `tags[]` | string(s) | Shown as chips in the server list ([Player.tsx#L4015-L4030][V-pl-server]) |
| `subtitles` | `{title, language: ISO639_1, type: vtt/srt/ttml mime, uri}[]` | Merged across all streams and deduplicated by URI ([useStream.ts#L583-L622][V-us-subs]) |
| `headers` | `any` | Passed straight to RNV `source.headers`. The host adds a `Cookie` from the jar. |
| `skip` | `{title?, from, to}[]` | Intro and outro skip ranges |

**There is no language, container/codec, duration, expiry or audio-track inventory field.**

### 1.6 Player wiring (react-native-video 6.19.2 + a large Android patch)
- **Source** ([Player.tsx#L2786-L2828][V-pl-src]):
  - `{uri, type?: 'm3u8'|'mpd', headers: selectedStream.headers, textTracks: externalSubs, startPosition, metadata, bufferConfig}`.
  - Buffer settings: `minBufferMs` 8 000, `maxBufferMs` 600 000, `bufferForPlayback` 1 500 / 3 000 after a rebuffer,
    plus **patched** `forwardBufferMB`/`backBufferMB`/`maxHeapAllocationPercent`.
  - `bufferingStrategy: DEPENDING_ON_MEMORY`.
- **Track props** ([L2865-L2875][V-pl-props]): `selectedAudioTrack`, `selectedTextTrack` and `selectedVideoTrack` are
  passed through, and all three **reset to defaults whenever the stream object changes** ([useStreamTrackSelections.ts#L9-L41][V-ust]):
  - audio = `{INDEX, 0}`;
  - text = `DISABLED`;
  - video = `AUTO`.
- **Audio tracks:**
  - `onAudioTracks` → `processAudioTracks` deduplicates by `type-title-language` ([useStream.ts#L722-L749][V-us-audio]).
  - The menu row title is `track.language || "Audio track N"`.
  - Selecting a track sets `{type: SelectedTrackType.LANGUAGE, value: track.language}` and saves it as a **single global
    `lastAudioTrack`** ([Player.tsx#L3809-L3843][V-pl-audio]).
  - When the next stream first reports tracks, the saved language is applied by exact match, as an INDEX selection
    ([L2504-L2556][V-pl-restore]). There's an audio-delay control as well.
- **Quality:**
  - `onVideoTracks` → tracks are deduplicated by bitrate and height and sorted.
  - The menu offers "Auto" (ABR) plus rows that set `{INDEX, track.index}`, or `{RESOLUTION, height}` when there's no
    index ([Player.tsx#L4100-L4170][V-pl-quality]).
  - Single-variant streams say "This stream has a single quality".
- **Subtitles:** sidecar subtitles go in `source.textTracks`. The **Android patch merges them as `SingleSampleMediaSource`s**
  because "ProgressiveMediaSource.Factory (and HLS/DASH variants) silently ignore MediaItem.SubtitleConfiguration entries"
  ([patch#L2464-L2504][V-patch-subs]). There's a subtitle delay and custom style.
- **What the Android patch does** ([react-native-video+6.19.2.patch][V-patch], 3,311 lines):
  1. `org.jellyfin.media3:media3-ffmpeg-decoder` with `EXTENSION_RENDERER_MODE_PREFER` adds FFmpeg audio decoding
     ([L9][V-patch-ffmpeg], [L2411][V-patch-ext]).
  2. **Per-stream data-source factory.** Upstream reused the cached factory whenever the new source had no headers, so the
     previous stream's headers (Cookie included) could leak. Upstream also attached RN's **shared cookie jar** to the
     player's OkHttp; the patch removes it. A `User-Agent` in the headers now overrides the default
     ([L867-L922][V-patch-ds]).
  3. `RangeFallbackHttpDataSource` switches to 1 MB bounded `Range` requests for servers that reject open-ended ranges
     ([L1903+][V-patch-range]).
  4. `ParallelDataSource` handles DDL hosts that throttle each connection: below **1.5 MB/s** it uses up to **4 ordered
     parallel range connections** ([L1176-L1226][V-patch-par]).
  5. `ChainedMatroskaDataSource` makes MKVs with a chained SeekHead seekable ([L98-L130][V-patch-mkv]).
  6. Audio-group selection skips tracks the device can't decode (E-AC-3/AC-3/TrueHD passthrough-only without FFmpeg),
     and **retries with a supported audio group** on an unsupported-track error ([L2911-L2960, L3077][V-patch-audio]).
  7. `DelayRenderersFactory` adds audio and subtitle delay, plus a custom subtitle overlay and PiP fixes.
- **HEVC detection:** if Android reports `naturalSize` 0×0, the player shows "This device can't play this video format.
  Try another server", because ExoPlayer dropped an undecodable video track such as 10-bit HEVC and is playing audio over
  black ([Player.tsx#L2721-L2735][V-pl-hevc]). **Directly relevant to Bearoom's HEVC `hev1` DASH.**
- **Networking under the player:**
  - `DohOkHttpFactory` replaces RN's `OkHttpClientFactory` with DNS-over-HTTPS (Cloudflare, Google or AdGuard, with
    bootstrap IPs) ([DohOkHttpFactory.kt][V-doh]).
  - The patched data source builds on `OkHttpClientProvider.getOkHttpClient()`, so **player segments inherit DoH**
    **(inferred from the patch at L867-L922)**.
  - Also shipped: ByeDPI (`libciadpi.so`) and Cloudflare WARP (`libusque.so`) modules for ISP blocks
    (`native-src/android/`). This is relevant because TMDB is blocked on Indian networks.
- **External player** ([SeasonList.tsx#L152-L196][V-ext-player]): an `ACTION_VIEW` intent with type `video/*`. It sends
  the headers in every known shape at once:
  - raw extras;
  - `android.media.intent.extra.HTTP_HEADERS`;
  - `headers`;
  - a `headers_array` of `"K: V"` strings;
  - `android.intent.extra.REFERRER`.
- **PiP:** `enterPictureInPicture()` from a button ([Player.tsx#L3549-L3556][V-pl-pip]), configured through the RNV config
  plugin (`enableAndroidPictureInPicture`, `supportsPictureInPicture`) ([app.config.js#L42-L53][V-appcfg-rnv]).
  Notification controls are on as well.
- **Cast and DLNA:**
  - `react-native-google-cast` plus a native LAN delivery server (`RemoteDeliveryModule`, 87 KB).
  - The server inspects HLS masters (`#EXT-X-MEDIA TYPE=AUDIO` with `LANGUAGE`), parses MKV headers, and remuxes or
    proxies **with the stream headers**, because cast receivers can't send headers
    ([remoteDeliveryService.ts#L52-L56, L89-L117][V-remote]).
  - Android only.
- **iOS workarounds:** none, because there's no iOS build.

### 1.7 Language and dub UX
How a Hindi user ends up hearing Hindi in Vega:
1. **Picks a provider:** an `india`-type or Hindi-dub-heavy one (manifest `type`).
2. **Picks a language at the link or server level:**
   - MovieBox Web returns **one `Link` per dub** ("Hindi", "English", …) on the details page
     ([movieBoxWeb/meta.ts#L61-L86][P-mbw-meta]), and the stream's `server` restates the language
     ([stream.ts#L155-L163][P-mbw-stream]).
   - Castle builds one stream per `(languageId × resolution)` and names it "Title - Hindi - 1080P". When the tracks are
     muxed rather than separate per language, the name joins them as "Hindi, Tamil, Telugu"
     ([castle/stream.ts#L40-L84][P-castle]).
   - DDL sites (vega, hdhub4u) put "Dual Audio [Hindi-English]" in scraped link titles
     ([vega/meta.ts#L185-L230][P-vega-meta]) and return MKVs ([hubcloud.ts][P-hubcloud]) **(inferred: titles carry the
     language)**.
3. **Switches the audio track in the player** (MKV dual audio, HLS audio renditions). The global sticky `lastAudioTrack`
   applies on the next stream.

There is no language preference setting, no ordered list, no per-title memory, and no language badge from structured data.

### 1.8 Watch party and sync
- None.
- `src/lib/sync/*` writes a `VegaSyncManifest` with downloads, history, watchlist, collections and tombstones into a
  `.vega-sync/` folder through SAF. The point is to sync with the desktop app through any shared folder
  ([manifest.ts#L3-L4, L94-L104][V-sync]).
- No file path in the full repo tree matches party, room, socket, syncplay or watch-together. I didn't grep file
  contents across the whole repo; `Player.tsx` contains no socket or room code.

---

## 2. CloudStream (recloudstream/cloudstream, Kotlin, GPL-3.0)

### 2.1 `ExtractorLink`
From [ExtractorApi.kt#L690-L760][C-el]:
- `source` (provider or extractor name, used for priority) and `name` (display);
- `url`;
- `referer`, kept **separate**: `getAllHeaders()` adds it only if `headers` has no referer, and a blank referer is never
  sent ([L742-L750][C-el-hdr]);
- `quality: Int`;
- `headers: Map<String,String>`;
- `extractorData` (for a verifier job);
- `type: ExtractorLinkType`;
- `audioTracks: List<AudioFile>`.

`isM3u8`/`isDash` are derived getters. Older constructors that take `isM3u8`/`isDash` booleans stay for extension
compatibility ([L800-L840][C-el-compat]).

- **Type:** `VIDEO` (single byte stream, any container), `M3U8` (including encrypted), `DASH`, `TORRENT` or `MAGNET`.
  It has a MIME mapping and `inferTypeFromUrl` (`.m3u8`/`.mpd`/`.torrent`/`magnet:`). `INFER_TYPE = null` means "infer"
  ([L417-L462][C-type]).
- **Quality:** `enum Qualities(value, defaultPriority)` with `Unknown(400)`, P144…P2160. `getQualityFromName` parses
  "1080p" and "4k" ([L852-L894][C-qual]).
- **Subclasses:**
  - `ExtractorLinkPlayList`, a list of `{url, durationUs}` for sites that split a video into concatenated parts
    ([L355-L414][C-pl]);
  - `DrmExtractorLink` for ClearKey and Widevine ([L591+][C-drm]).
- **`SubtitleFile(lang, url, headers?)`** with a `langTag` that resolves IETF from a code or a language name
  ([MainAPI.kt#L1199-L1235][C-sub]).
- **`AudioFile(url, headers?)`.** The KDoc promises `lang` and `label`, but the data class **only has `url` and
  `headers`** ([MainAPI.kt#L1243-L1265][C-audio]). Separate audio is merged as extra `MediaSource`s, with no language
  metadata from the provider.

### 2.2 Audio languages and dubs
- **Provider level:**
  - `MainAPI.lang = "en"`, an IETF tag ([MainAPI.kt#L546][C-lang]);
  - `SitePlugin.language` in the repo index ([RepositoryManager.kt#L71][C-repo]), used to filter providers by language.
- **`DubStatus { None(-1), Dubbed(1), Subbed(0) }`** ([MainAPI.kt#L905-L909][C-dub]):
  - Exists only for anime. `AnimeSearchResponse.dubStatus` and episode counts per status ([L1565-L1615][C-dub-add]).
  - `AnimeLoadResponse.episodes: MutableMap<DubStatus, List<Episode>>` ([L2333][C-anime-ep]).
  - The user picks Dub or Sub as an **episode list**, i.e. different links, before any stream is resolved. It's a binary
    flag, not a language.
- **In-stream tracks:**
  - The preferred audio language is persisted **per account** (`{account}/preferred_audio_language`)
    ([CS3IPlayer.kt#L127, L731-L742][C-pref]).
  - It is applied in `onTracksInfoChanged` **only if some track has that language**. The comment says: "Otherwise, it may
    give some users audio track init failed!" ([GeneratorPlayer.kt#L224-L234][C-gp-pref]).
  - Explicit selection uses `TrackSelectionOverride(group, formatIndex)` matched by `format.id`, and falls back to
    `setPreferredAudioLanguage` ([CS3IPlayer.kt#L392-L423][C-setaudio]).
  - The default selector starts with `setPreferredAudioLanguage(null)` ([L882-L890][C-ts]).

### 2.3 Player
- **Engine:** Media3 1.9.3 (exoplayer, hls, dash, okhttp, cronet, cast, session, ui) plus **nextlib-media3ext
  1.9.3-0.12.0**, the FFmpeg audio and video software decoders from Next Player
  ([libs.versions.toml#L40-L43, L121-L135][C-libs]; [build.gradle.kts#L248-L252][C-gradle]).
  - The software-decoding setting switches `FixedNextRenderersFactory` between `EXTENSION_RENDERER_MODE_PREFER` and
    `_ON`, with decoder fallback.
  - There's an optional dynamic-range compressor audio sink ([CS3IPlayer.kt#L1125-L1150][C-render]).
- **Headers:** `createVideoSource` builds a per-link `OkHttpDataSource` (or `CronetDataSource`) with
  `setDefaultRequestProperties(refererMap + link.headers)`. A User-Agent from `headers` is honoured
  ([L800-L843][C-ds]).
- **Sidecar subtitles:** each URL subtitle becomes a `SingleSampleMediaSource` with **its own header-carrying data source**
  ([L1757-L1790][C-subsrc]).
- **Separate audio:** `AudioFile`s become extra `MediaSource`s and are merged with `MergingMediaSource`
  ([L1792-L1811, L2001-L2005][C-audsrc]).
- **Track UI:** one "tracks" dialog with a video list sorted by height descending and an audio list
  ([GeneratorPlayer.kt#L1410-L1440][C-gp-dlg]).
  - Apply calls `setPreferredAudioTrack(lang, id, formatIndex)` and then `setMaxVideoSize(w, h, id)`
    ([L1542-L1556][C-gp-apply]).
  - That pins the exact video track by override, or caps the max size ([CS3IPlayer.kt#L364-L389][C-maxsize]).
- **Source ranking:**
  - Quality profiles (None/WiFi/Data/Download).
  - Priority = `qualityPriority + sourcePriority(source name)`.
  - **Once any link reaches `AUTO_SKIP_PRIORITY = 10`, playback starts without waiting for the remaining extractors**;
    otherwise a "Skip loading (n)" button appears ([QualityDataHelper.kt#L37, L47-L52, L244-L255][C-qdh];
    [GeneratorPlayer.kt#L2364-L2390][C-gp-auto]).
- **External players** (`actions/temp/*Package.kt`): VLC, MPV, mpvKt, MpvRx, Just Player, Next Player, Web Video Cast,
  Aria2, browser, and copy-link.
  - The VLC handoff sends `position`, `title` and one subtitle, **but no headers**. A multi-link handoff uses a temporary
    M3U8 ([VlcPackage.kt#L44-L68][C-vlc]).
  - **(inferred)** Header-gated streams therefore fail in VLC.

### 2.4 Extension repos: distribution, pinning, updates
- **Repo index:**
  - `repo.json` = `{name, description, iconUrl, manifestVersion, pluginLists: [urls]}`.
  - Each plugin list holds `SitePlugin` entries: `{url → .cs3, status (0 down / 1 ok / 2 slow / 3 beta), version: Int,
    apiVersion, name, internalName, authors, language, tvTypes, fileSize, fileHash}`
    ([RepositoryManager.kt#L33-L76][C-repo]).
- **Adding a repo:** by URL, by `cloudstreamrepo://` / `https://cs.repo/`, or by a shortcode resolved through cutt.ly or
  py.md redirects ([L132-L159][C-repo-url]). The index is cached for 5 min ([L161-L180][C-repo-parse]). An optional
  setting rewrites raw.githubusercontent URLs to jsDelivr ([L124-L130][C-jsd]).
- **Download:**
  - Goes to a temp file, then a **SHA-256 check against `fileHash`** ("sha256-…"), then an atomic move
    ([L193-L240][C-dl]).
  - Files are salted by repo URL, so the same internal name can come from two repos.
- **Update:**
  - Outdated means `online.version > installed.version` (an integer), or `PLUGIN_VERSION_ALWAYS_UPDATE`.
  - `status == 0` **unloads the plugin remotely** ([PluginManager.kt#L224-L240, L274-L320][C-upd]).
  - Pinning is only as good as the repo's `url`. A repo that points at a commit-pinned `.cs3` URL is pinned, and the hash
    makes it tamper-evident.
- **Runtime:**
  - **Native Dex loaded into the app process with `PathClassLoader`.** There is no sandbox; the file is set read-only to
    satisfy Android 14 ([PluginManager.kt#L593-L640][C-load]).
  - Doesn't transfer to RN except as a cautionary contrast.

### 2.5 Sync
- `SyncAPI` is "Stateless synchronization class, used for syncing status about a specific movie/show": `updateStatus`,
  `status`, `load`, `search`, `library` ([SyncAPI.kt#L15-L70][C-sync]).
- Providers: AniList, MAL, Kitsu, Simkl and LocalList, plus subtitle APIs (OpenSubtitles, Addic7ed, Subdl, SubSource).
- No playback sync or watch party appeared in the `syncproviders/` or `ui/player/` listings.

### 2.6 Licence
- GPL-3.0 ([LICENSE][C-lic]).
- **(inferred)** Copying code would require GPL-3.0 for the whole Bearoom app, so treat it as reference only. The extension
  repos are separately licensed.

---

## 3. Synthesis for Bearoom

### (a) Plugin host and provider contract
1. **Adopt Vega's sandbox shape for the on-device Nuvio host.** It is stricter than Nuvio's and lighter than Cove's.
   - One hidden `react-native-webview` loaded with `baseUrl` = a `.invalid` origin and a CSP of `connect-src 'none'`,
     reloaded on renderer death ([ProviderSandboxHost.tsx#L8-L89][V-host]).
   - **A fresh Worker per invoke**, ambient network and storage globals deleted, module code run through `new Function`
     with those names shadowed, and a pre-warmed spare worker ([sandboxWorker.ts#L61-L74, L285-L348][V-worker];
     [sandboxDocument.ts#L57-L79][V-doc]).
   - Frames sent as JSON-quoted literals into `injectJavaScript` ([sandboxBridge.ts#L99-L116][V-bridge-post]).
2. **Change Vega's budgets.** Vega runs one provider at a time, which suits browsing, but Bearoom fans out per TMDB id.
   - Raise `maxActiveInvokes` from 2 to Cove's ≈12.
   - Use Cove's 15 s per plugin and 20 s overall, not Vega's 120 s.
   - Keep Vega's **native-side backstop that reloads the WebView** ([sandboxBridge.ts#L87-L97][V-bridge]) and its 15 s
     "sandbox never ready" fail.
3. **Native fetch RPC:**
   - Copy Vega's per-hop redirect loop with re-validation ([providerFetch.ts#L160-L275][V-fetch-and]),
     `Authorization`-drop on a host change, CR/LF rejection, and the `x-set-cookie` mirror.
   - Copy its per-domain token bucket keyed by **registrable domain** ([rateLimiter.ts#L35-L66][V-rl]).
   - **(inferred)** Bearoom needs the native redirect-manual path on **both** OSes. Vega only built it for Android;
     the iOS axios fallback fakes it.
4. **Per-author cookie jar → stream `headers.Cookie`** ([ProviderManager.ts#L372-L394][V-pm-cookie]). This is the fix for
   the 54 Cookie-gated MovieBox DASH streams when a plugin forgets to pass the Cookie. Also copy the WAF dialog
   coalescing per `site + cookie` ([wafResolver.ts][V-waf]).
5. **Host API surface:**
   - Vega's set: fetch, axios, cheerio, crypto digest and random, kv, getCookies, openWebView.
   - **Plus the Nuvio globals Bearoom measured** (`TMDB_API_KEY`, `SCRAPER_SETTINGS`, `CryptoJS`).
6. **Supply chain:** take CloudStream's integer `version`, **SHA-256 `fileHash`**, `status` kill switch (0 = unload) and
   repo-URL salting ([RepositoryManager.kt#L33-L76, L193-L240][C-repo]; [PluginManager.kt#L224-L320][C-upd]). Vega has
   none of the hash, integer version or pin.

### (b) Stream model fields
Merge both (and the Stremio shape from the earlier doc) into Bearoom's stream type:
- **`type`:** an enum `hls | dash | mp4 | mkv | torrent`, inferred from the URL when absent (CloudStream
  [L417-L462][C-type]). Avoid Vega's free-text `type`, where `"dash"` is unmapped.
- **`referer` separate from `headers`,** merged by the `getAllHeaders` rule: add only if missing, never send blank
  ([L742-L750][C-el-hdr]).
- **`quality:`** an integer plus `Unknown`, with a host-measured `probedQuality` alongside (the earlier doc).
- **`subtitles[]`:** `{lang, langTag, url, headers?, mime}`. CloudStream gives subtitles their own headers; Vega doesn't.
- **`audioTracks[]`:** separate audio URLs with headers, **plus the `lang`/`label` that CloudStream's KDoc promises but its
  class lacks** ([MainAPI.kt#L1243-L1265][C-audio]).
- **`skip[]`:** `{from, to, title}` (Vega). Useful for a party "skip intro" vote.
- **`tags[]`:** displayed chips (Vega).
- **`language` (ISO 639-1) and `audioLanguages[]`:** **neither app has these.** Bearoom must add them, normalised from
  server names, link titles and probed tracks.
- **`extractorData` and `source` vs `name`:** `source` keys the ranking (CloudStream).

### (c) Dub and language UX
1. **Language is a first-class row, not free text.** Both competitors leak it into server names ("Castle - Hindi -
   1080P", "Hindi 1080P"). Bearoom should parse it into `language` and show a badge.
2. **Picking a language comes before picking a server.** MovieBox Web models each dub as a separate link on the details
   page ([meta.ts#L61-L86][P-mbw-meta]), and CloudStream does the same for anime Dub/Sub ([MainAPI.kt#L2333][C-anime-ep]).
   That matches the planned "inventory projection" (the earlier doc §3.4): one row per language, backed by a sibling URL
   or an in-stream track.
3. **Apply the saved preference only if it's present.** Copy CloudStream's guard ([GeneratorPlayer.kt#L229-L233][C-gp-pref]).
   - Persist the preference per user (CloudStream does it per account), not as one global key (Vega's `lastAudioTrack`).
   - Keep the Nuvio rule: per-title choice, then the ordered list, then the stream default.
4. **Select tracks by id, falling back to language** (CloudStream [L392-L423][C-setaudio]).
   - Reset selections when the stream changes, then re-apply the preference once tracks report (Vega
     [useStreamTrackSelections.ts#L9-L41][V-ust], [Player.tsx#L2504-L2556][V-pl-restore]).
   - In a party, audio language is **local per member**: the room shares the timeline, not the dub.
5. **Region-tag plugins** like Vega's manifest `type` (`india`), or `language` on each plugin entry (CloudStream).
   Bearoom can order plugins by the user's language list before ranking.

### (d) Player wiring, and whether Vega's react-native-video choice argues against expo-video
**Patterns to copy whichever engine Bearoom uses:**
- **Build the HTTP data source per stream.** Never reuse one across streams, and never attach the app's shared cookie jar.
  Let a `User-Agent` in the headers override the default (Vega patch [L867-L922][V-patch-ds]).
  - **(inferred, untested)** Check whether expo-video's Android `DataSourceUtils` caches a factory or attaches RN cookies
    the way upstream RNV does.
- **Give sidecar subtitles and separate audio their own header-carrying sources** (CloudStream
  [L1757-L1811][C-subsrc]).
- **Detect "video dropped, audio playing" and fail over.** On Android, 0×0 `naturalSize` means an undecodable HEVC track
  (Vega [Player.tsx#L2721-L2735][V-pl-hevc]). Bearoom's DASH is HEVC `hev1`, so add a capability check before choosing a
  stream.
- **Failover:** next stream on error (Vega) **plus** CloudStream's "start as soon as a link reaches the priority
  threshold" ([GeneratorPlayer.kt#L2364-L2390][C-gp-auto]). This lines up with kunai's "balanced" startup.
- **External-player handoff on Android:** send headers in every known extra shape (Vega
  [SeasonList.tsx#L152-L196][V-ext-player]). CloudStream's VLC handoff drops headers ([VlcPackage.kt#L44-L68][C-vlc]),
  so header-gated streams can't be handed off without a local proxy.
- **Cast needs a local header-injecting LAN proxy** (Vega `RemoteDeliveryService`). The same local proxy would fix
  libVLC's Cookie/Origin gap.

**Evidence on RNV vs expo-video, per need:**

| Need | What Vega and RNV 6.19.2 show | Effect on Bearoom's expo-video phase 1 |
|---|---|---|
| Headers on every segment (Cookie, Origin) | **Android:** OkHttp `setDefaultRequestProperties` on every request, *after* the patch fixed factory reuse and the shared cookie jar ([V-patch-ds]). **iOS:** RNV uses the same `AVURLAssetHTTPHeaderFieldsKey` as expo-video and also forwards `HTTPCookieStorage.shared.cookies` ([RCTVideoUtils.swift#L374-L381][R-hdr]). | **No iOS advantage.** On Android expo-video already applies headers to every request (earlier doc §1.12). Neutral. |
| Audio-track switching | `selectedAudioTrack {LANGUAGE \| INDEX}` on both OSes; on Android the patch adds unsupported-codec fallback and FFmpeg. iOS uses `AVMediaSelectionGroup` ([RCTPlayerOperations.swift#L87][R-ops]). | Neutral. Both use the same platform mechanisms, and iOS can't switch muxed-TS audio with either. Bearoom's measured streams are AAC only, so FFmpeg isn't needed yet. |
| Manual quality | `selectedVideoTrack` works on Android (Vega uses INDEX and RESOLUTION). On iOS only `maxBitRate` → `preferredPeakBitRate` ([RCTVideo.swift#L959-L962][R-mbr]). | **Android advantage for RNV.** expo-video needs the HLS variant-URL swap (earlier doc §3.4). |
| Sidecar subtitles | **Android:** works only with Vega's patch; its comment says the factories "silently ignore" `SubtitleConfiguration` **(untested upstream)**. **iOS:** RNV **skips sidecar text tracks for `.m3u8`** ([RCTVideo.swift#L704][R-m3u8]), and for MP4 uses an `AVMutableComposition`, which disables AirPlay ([L708][R-m3u8]). | **No real advantage.** Bearoom needs an RN-rendered VTT/SRT overlay anyway for iOS HLS. One overlay on both OSes is simpler. |
| Precise seek, for sync | RNV iOS `seek(time, tolerance)` passes the caller's tolerance to `toleranceBefore/After` ([RCTPlayerOperations.swift#L131-L152][R-seek]). | **The one real iOS advantage for RNV.** For expo-video on SDK 53, back-port the SDK 54 zero-tolerance fix (earlier doc §3.5). |
| Expo SDK 53 | RNV 6.19.2 peers are `react: *`, `react-native: *`, and it ships the config plugin Vega uses ([app.config.js#L42-L53][V-appcfg-rnv]). Vega itself is on SDK 57 / RN-tvOS 0.86 and keeps it working with a 149 KB `patch-package` patch. | **(inferred)** RNV probably installs on SDK 53, but Vega doesn't prove that. To get Vega's behaviour Bearoom would have to own a large native patch. |

**Verdict.** Vega's choice doesn't count against expo-video for Bearoom:
- **It is Android-only.** Its wins came from patching ExoPlayer, not from react-native-video as shipped.
- **On iOS,** RNV fixes none of the gaps the earlier doc found: headers use the same AVURLAsset key, it has no
  `videoTrack` selection, no HLS sidecar subtitles, and the same muxed-TS audio limit. Its one iOS advantage is
  seek tolerance, which Bearoom can back-port.

**Keep expo-video for phase 1** as the council decided, and design the `PlayerEngine` contract (earlier doc §3.5) so an
**RNV Android adapter** can be added later.

That adapter would be worth building only if manual quality, Android sidecar subtitles or FFmpeg audio (an MKV,
AC-3 or E-AC-3 tier) become requirements. If it is built, Bearoom should port Vega's three Android fixes:
- the per-stream factory;
- no shared cookie jar;
- the sidecar-subtitle merge.

Bearoom should port them as its own patch, re-implemented, or copied only from the Apache-2.0 snapshot of Vega
(≤ `9ccc0c8`).

---

<!-- link references -->
[V]: https://github.com/vega-org/vega-app/tree/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5
[V-rel]: https://github.com/vega-org/vega-app/releases/tag/v5.0.2
[V-lic]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/LICENSE
[V-notice]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/NOTICE
[V-appcfg-plat]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/app.config.js#L199
[V-appcfg-rnv]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/app.config.js#L42-L53
[V-help-repo]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/utils/helpers.ts#L17
[V-help-raw]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/utils/helpers.ts#L44-L56
[V-help-path]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/utils/helpers.ts#L267-L300
[V-ext-init]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/services/ExtensionManager.ts#L511-L519
[V-ext-manifest]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/services/ExtensionManager.ts#L142-L236
[V-ext-dl]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/services/ExtensionManager.ts#L241-L328
[V-ext-test]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/services/ExtensionManager.ts#L330-L403
[V-extst-upd]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/storage/extensionStorage.ts#L457-L482
[V-upd-int]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/services/UpdateProviders.ts#L17
[V-upd-auto]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/services/UpdateProviders.ts#L211-L262
[V-srcintent]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/services/sourceIntent.ts
[V-host]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/components/ProviderSandboxHost.tsx#L8-L89
[V-doc]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/runtime/sandboxDocument.ts#L57-L151
[V-worker]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/runtime/sandboxWorker.ts#L61-L348
[V-worker-ax]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/runtime/sandboxWorker.ts#L159-L232
[V-worker-ctx]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/runtime/sandboxWorker.ts#L251-L263
[V-worker-state]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/runtime/sandboxWorker.ts#L381-L433
[V-bridge]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/sandboxBridge.ts#L41-L143
[V-bridge-post]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/sandboxBridge.ts#L99-L116
[V-proto]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/protocol.ts#L79-L82
[V-rpc]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/providerRpc.ts#L18-L215
[V-rpc-crypto]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/providerRpc.ts#L111-L150
[V-baseurl]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/providers/getBaseUrl.ts
[V-fetch]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/providerFetch.ts
[V-fetch-hdr]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/providerFetch.ts#L21-L54
[V-fetch-and]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/providerFetch.ts#L160-L275
[V-fetch-ios]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/providerFetch.ts#L277-L330
[V-urlguard]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/urlGuard.ts#L77-L99
[V-rl]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sandbox/rateLimiter.ts#L35-L66
[V-waf]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/services/wafResolver.ts#L11-L38
[V-pctx]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/providers/providerContext.ts#L10-L29
[V-pm-exec]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/services/ProviderManager.ts#L77-L148
[V-pm-cookie]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/services/ProviderManager.ts#L372-L394
[V-types-stream]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/providers/types.ts#L30-L54
[V-types-prov]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/providers/types.ts#L113-L175
[V-types-ctx]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/providers/types.ts#L281-L295
[V-us-next]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/hooks/useStream.ts#L366-L376
[V-us-fetch]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/hooks/useStream.ts#L484-L505
[V-us-retry]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/hooks/useStream.ts#L542-L548
[V-us-subs]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/hooks/useStream.ts#L583-L622
[V-us-audio]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/hooks/useStream.ts#L722-L749
[V-ust]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/hooks/useStreamTrackSelections.ts#L9-L41
[V-pl-err]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/screens/home/Player.tsx#L1742-L1772
[V-pl-restore]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/screens/home/Player.tsx#L2504-L2556
[V-pl-hevc]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/screens/home/Player.tsx#L2721-L2735
[V-pl-src]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/screens/home/Player.tsx#L2786-L2828
[V-pl-props]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/screens/home/Player.tsx#L2865-L2875
[V-pl-pip]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/screens/home/Player.tsx#L3549-L3556
[V-pl-audio]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/screens/home/Player.tsx#L3809-L3843
[V-pl-server]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/screens/home/Player.tsx#L4002-L4060
[V-pl-quality]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/screens/home/Player.tsx#L4100-L4170
[V-ext-player]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/components/SeasonList.tsx#L152-L196
[V-patch]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/patches/react-native-video%2B6.19.2.patch
[V-patch-ffmpeg]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/patches/react-native-video%2B6.19.2.patch#L1-L12
[V-patch-ds]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/patches/react-native-video%2B6.19.2.patch#L867-L922
[V-patch-mkv]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/patches/react-native-video%2B6.19.2.patch#L98-L130
[V-patch-par]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/patches/react-native-video%2B6.19.2.patch#L1176-L1226
[V-patch-range]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/patches/react-native-video%2B6.19.2.patch#L1903-L1940
[V-patch-ext]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/patches/react-native-video%2B6.19.2.patch#L2405-L2440
[V-patch-subs]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/patches/react-native-video%2B6.19.2.patch#L2464-L2504
[V-patch-audio]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/patches/react-native-video%2B6.19.2.patch#L2911-L3115
[V-doh]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/native-src/android/com/vega/DohOkHttpFactory.kt
[V-remote]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/remote/remoteDeliveryService.ts#L52-L117
[V-sync]: https://github.com/vega-org/vega-app/blob/956673e80a04aae87ef6eb0e3536b7a9cb83a1f5/src/lib/sync/manifest.ts#L1-L104
[P]: https://github.com/Zenda-Cross/vega-providers/tree/319931d102b55926c220cd9992cc6f71963b2b7a
[P-pkg]: https://github.com/Zenda-Cross/vega-providers/blob/319931d102b55926c220cd9992cc6f71963b2b7a/package.json#L5
[P-readme]: https://github.com/Zenda-Cross/vega-providers/blob/319931d102b55926c220cd9992cc6f71963b2b7a/README.md
[P-manifest]: https://github.com/Zenda-Cross/vega-providers/blob/319931d102b55926c220cd9992cc6f71963b2b7a/manifest.json
[P-types]: https://github.com/Zenda-Cross/vega-providers/blob/319931d102b55926c220cd9992cc6f71963b2b7a/providers/types.ts#L36-L46
[P-castle]: https://github.com/Zenda-Cross/vega-providers/blob/319931d102b55926c220cd9992cc6f71963b2b7a/providers/castle/stream.ts#L40-L84
[P-mbw-meta]: https://github.com/Zenda-Cross/vega-providers/blob/319931d102b55926c220cd9992cc6f71963b2b7a/providers/movieBoxWeb/meta.ts#L61-L86
[P-mbw-stream]: https://github.com/Zenda-Cross/vega-providers/blob/319931d102b55926c220cd9992cc6f71963b2b7a/providers/movieBoxWeb/stream.ts#L155-L163
[P-vega-stream]: https://github.com/Zenda-Cross/vega-providers/blob/319931d102b55926c220cd9992cc6f71963b2b7a/providers/vega/stream.ts#L5-L24
[P-vega-meta]: https://github.com/Zenda-Cross/vega-providers/blob/319931d102b55926c220cd9992cc6f71963b2b7a/providers/vega/meta.ts#L185-L230
[P-hubcloud]: https://github.com/Zenda-Cross/vega-providers/blob/319931d102b55926c220cd9992cc6f71963b2b7a/providers/extractors/hubcloud.ts#L63-L326
[P-mx]: https://github.com/Zenda-Cross/vega-providers/blob/319931d102b55926c220cd9992cc6f71963b2b7a/providers/mxplayer/stream.ts#L73-L76
[C]: https://github.com/recloudstream/cloudstream/tree/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d
[C-lic]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/LICENSE
[C-el]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/utils/ExtractorApi.kt#L690-L760
[C-el-hdr]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/utils/ExtractorApi.kt#L742-L750
[C-el-compat]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/utils/ExtractorApi.kt#L800-L840
[C-type]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/utils/ExtractorApi.kt#L417-L462
[C-qual]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/utils/ExtractorApi.kt#L852-L894
[C-pl]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/utils/ExtractorApi.kt#L355-L414
[C-drm]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/utils/ExtractorApi.kt#L591-L690
[C-sub]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/MainAPI.kt#L1199-L1235
[C-audio]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/MainAPI.kt#L1243-L1265
[C-lang]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/MainAPI.kt#L546
[C-dub]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/MainAPI.kt#L905-L909
[C-dub-add]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/MainAPI.kt#L1565-L1615
[C-anime-ep]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/library/src/commonMain/kotlin/com/lagradost/cloudstream3/MainAPI.kt#L2333
[C-libs]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/gradle/libs.versions.toml#L40-L135
[C-gradle]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/build.gradle.kts#L248-L252
[C-pref]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/CS3IPlayer.kt#L727-L745
[C-maxsize]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/CS3IPlayer.kt#L364-L389
[C-setaudio]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/CS3IPlayer.kt#L392-L423
[C-ds]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/CS3IPlayer.kt#L800-L843
[C-ts]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/CS3IPlayer.kt#L882-L890
[C-render]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/CS3IPlayer.kt#L1125-L1150
[C-subsrc]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/CS3IPlayer.kt#L1757-L1811
[C-audsrc]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/CS3IPlayer.kt#L1792-L1811
[C-gp-pref]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/GeneratorPlayer.kt#L224-L234
[C-gp-dlg]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/GeneratorPlayer.kt#L1410-L1440
[C-gp-apply]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/GeneratorPlayer.kt#L1542-L1556
[C-gp-auto]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/GeneratorPlayer.kt#L2364-L2390
[C-qdh]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/ui/player/source_priority/QualityDataHelper.kt#L37-L255
[C-vlc]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/actions/temp/VlcPackage.kt#L44-L68
[C-repo]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/plugins/RepositoryManager.kt#L33-L76
[C-jsd]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/plugins/RepositoryManager.kt#L124-L130
[C-repo-url]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/plugins/RepositoryManager.kt#L132-L159
[C-repo-parse]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/plugins/RepositoryManager.kt#L161-L180
[C-dl]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/plugins/RepositoryManager.kt#L193-L240
[C-upd]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/plugins/PluginManager.kt#L224-L320
[C-load]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/plugins/PluginManager.kt#L593-L640
[C-sync]: https://github.com/recloudstream/cloudstream/blob/4846fbacd2f93e373f1bc7c231f2d4c03c812f3d/app/src/main/java/com/lagradost/cloudstream3/syncproviders/SyncAPI.kt#L15-L70
[R-hdr]: https://unpkg.com/browse/react-native-video@6.19.2/ios/Video/Features/RCTVideoUtils.swift
[R-ops]: https://unpkg.com/browse/react-native-video@6.19.2/ios/Video/Features/RCTPlayerOperations.swift
[R-seek]: https://unpkg.com/browse/react-native-video@6.19.2/ios/Video/Features/RCTPlayerOperations.swift
[R-mbr]: https://unpkg.com/browse/react-native-video@6.19.2/ios/Video/RCTVideo.swift
[R-m3u8]: https://unpkg.com/browse/react-native-video@6.19.2/ios/Video/RCTVideo.swift

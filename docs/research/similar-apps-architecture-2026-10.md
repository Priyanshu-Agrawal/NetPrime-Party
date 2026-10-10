# Similar apps: plugin host, stream model, player and sync patterns (2026-10-10)

**Scope:** read-only architecture research for Bearoom (RN 0.79 / Expo SDK 53). Covers plugin hosting, the stream object,
ranking, language and quality UX, player engine choice, and watch-party sync. No repo files were modified and no third-party
code was run. All sources were read as text through `raw.githubusercontent.com`, the GitHub web UI, a few unauthenticated
`api.github.com` calls, and web search.
**Inputs read first:** `docs/research/plugin-catalog-measurement-2026-10.md` and `docs/research/github-scraper-landscape-2026-10.md` §3.
**Labels:** a claim without a tag was read directly in source or docs at the cited URL. **(inferred)** marks my reasoning, and
**(untested)** marks something that needs a device test.

---

## 0. Summary

1. **Bearoom's sync engine already follows the proven model:** an anchor plus a server-clock offset, with dead-band → rate
   nudge → hard seek. Jellyfin SyncPlay, Metastream and Bearoom's `PartySyncEngine` all compute
   `position = anchorPos + (serverNow − anchorTime) × rate`. **What Bearoom still lacks is the buffering protocol:**
   - a 3 s debounce before a stall counts as buffering;
   - a group-wait barrier with a timeout (Jellyfin: 30 s);
   - unpause scheduled in the future at `max(2 × highest ping, 500 ms)`;
   - a catch-up rule for members who buffered.
2. **Plugin host numbers to copy (from Cove, the most hardened Nuvio host):**
   - 15 s cap per scraper, 20 s overall budget, 12 scrapers in parallel;
   - return early once there are ≥3 results and answers have stopped arriving for 1.2 s;
   - stragglers keep running into a 15-minute per-scraper cache, and failures are never cached;
   - fetch limits: 8 s per fetch, 20 MiB cap, at most 5 redirects, each hop re-validated against a public-address-only
     policy, and credentials stripped when a redirect changes host.

   Nuvio itself is laxer: 10 plugins at once, a 60 s timeout per plugin, no address guard, and it trusts all TLS
   certificates during playback.
3. **The stream object to use is Stremio's.** Nuvio already maps plugin output onto it:
   - `behaviorHints.proxyHeaders.request/response`, with `notWebReady: true` whenever headers exist;
   - `bingeGroup`, used to auto-pick the same source family for the next episode;
   - `subtitles[]`.

   Stremio delivers those headers through a **local proxy URL**
   (`/proxy/d=<origin>&h=K:V&r=K:V/<path>`), not through the player.
4. **The expo-video-first lean holds for Android but is weaker than assumed on iOS** (details in §6):
   - **(a) Muxed multi-audio:** AVPlayer supports only one audio track inside a TS stream (Apple staff). The only
     multi-audio streams measured (Castle, 5 AAC tracks) are muxed in TS, so iOS cannot switch between them.
   - **(b) Headers:** iOS headers go through `AVURLAssetHTTPHeaderFieldsKey`, which an Apple engineer calls "not a
     supported API". Reports conflict on whether segment requests carry the headers.
   - **(c) Seeking:** on SDK 53 (expo-video 2.2.3), setting `currentTime` on iOS seeks *without* zero tolerance, so seeks
     are imprecise. SDK 54 fixed this.
   - **(d) Events and tracks:** there is no `seeked` event; `videoTrack` is read-only (so no manual quality selection);
     and there is no external-subtitle API, even in today's v58.
   - **(e) What peers did:** Nuvio (the only Nuvio-plugin host app; it left React Native) and Streamyfin (a large Expo app)
     both shipped their **own libmpv modules** instead of expo-video or react-native-video.

   **On Android, expo-video is a good fit.** It uses OkHttp with `setDefaultRequestProperties(headers)`, so every manifest
   and segment request, on any host, carries Cookie and Origin. It also bundles the Media3 DASH module.

---

## 1. Per-project findings

### 1.1 Nuvio (NuvioMedia/NuvioMobile): the app that hosts Nuvio plugins
- **Repository status:** the React Native app `tapframe/NuvioStreaming` now redirects to repository id 964702894, which is
  [NuvioMedia/NuvioMobile](https://github.com/NuvioMedia/NuvioMobile): 3 848★, GPL-3.0, Kotlin, default branch `cmp-rewrite`,
  pushed 2026-10-08. The history has been rewritten: there are no commits before 2026, and the RN code is no longer in it
  ([commits API](https://api.github.com/repos/NuvioMedia/NuvioMobile/commits?sha=cmp-rewrite)). I could not find why
  they left React Native ([search](https://github.com/tapframe/NuvioStreaming)).
- **Plugin runtime**
  ([PluginRuntime.kt#L40-L41](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/PluginRuntime.kt#L40-L41)):
  - `MAX_CONCURRENT_PLUGINS = 10` (a semaphore) and `PLUGIN_TIMEOUT_MS = 60_000`.
  - A new QuickJS runtime per call, with the polyfill pre-compiled to bytecode.
  - `setSearchPaused()` cancels in-flight scrapes and restarts them when unpaused (L48). I infer it exists to free
    bandwidth while the player is up.
  - Result parsing: `url` may be a string or `{url}`; `headers` and `subtitles[].headers` are kept; values containing
    `"[object"` are dropped.
- **Fetch bridge**
  ([FetchBridge.kt](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/network/FetchBridge.kt)):
  - Signature: `__native_fetch(url, method, headersJson, bodyKind: none|text|base64, body, followRedirects)`.
  - Returns `{ok,status,url,statusText,body,bodyBase64,headers(lowercased)}`, truncating each header value at 8 KiB.
  - Injects a desktop Chrome User-Agent when the plugin sends none (L62).
  - Has no address or SSRF guard.
- **Stream conversion**
  ([StreamFetchSupport.kt#L85-L136](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamFetchSupport.kt#L85-L136)):
  - Plugin `headers` are trimmed, blank and `Range` entries are dropped, and the rest become
    `behaviorHints{notWebReady:true, proxyHeaders.request}`.
  - The description joins `quality • size • language`.
  - Within a group, streams are sorted alphabetically by source, label and description (L138).
- **Loading and ranking**
  ([StreamsRepository.kt](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamsRepository.kt),
  [StreamAutoPlaySelector.kt](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamAutoPlaySelector.kt)):
  - Loading placeholders appear immediately, and each group is published as soon as it completes.
  - **No quality or health scoring.** Order is: debrid first, then add-ons in install order, then plugins.
  - Autoplay modes are `MANUAL | FIRST_STREAM | REGEX_MATCH` (a user regex over name, label, description and URL, with
    `(?!…)` exclusions).
  - Autoplay timeout: `0` means decide on every response; `1–30 s` means wait, then pick; unlimited means a hard 60 s
    fallback to the picker (L385-L395).
  - The persisted **bingeGroup** wins for next-episode autoplay. Ready runners-up are kept as `autoPlayCandidates`.
- **Player engine:**
  - **Android**
    ([PlayerEngine.android.kt#L133-L166](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/androidMain/kotlin/com/nuvio/app/features/player/PlayerEngine.android.kt#L133-L166)):
    in `Auto` mode it tries ExoPlayer first and, on any player error, logs "ExoPlayer failed; falling back to libmpv" and
    remounts with libmpv. Users can force either engine. A separate `sourceAudioUrl` is joined to the video through
    `MergingMediaSource` (L345).
  - **iOS** (that platform's
    [PlayerEngine.ios.kt](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/iosMain/kotlin/com/nuvio/app/features/player/PlayerEngine.ios.kt)
    and
    [MPVPlayerBridge.swift](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/iosApp/iosApp/Player/MPVPlayerBridge.swift#L480-L512)):
    libmpv only (`vo=gpu-next`, Vulkan via MoltenVK, `hwdec=videotoolbox`). There is no AVPlayer path for main playback.
- **Headers to the player:**
  - Android uses an OkHttp `DataSource` with `setDefaultRequestProperties(headers)`, which applies to every request, plus a
    default UA, 15 s connect and read timeouts, and IPv4-first DNS
    ([PlayerPlaybackNetworking.kt#L51-L104](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/androidMain/kotlin/com/nuvio/app/features/player/PlayerPlaybackNetworking.kt#L51-L104)).
    ⚠ It installs a **trust-all X509TrustManager and hostname verifier** (L30-L45). Do not copy this.
  - iOS passes mpv `http-header-fields`, escaping commas
    ([MPVPlayerBridge.swift#L1316-L1335](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/iosApp/iosApp/Player/MPVPlayerBridge.swift#L1316-L1335)).
  - `proxyHeaders.response` overrides upstream response headers on Android
    ([ResponseHeaderOverridingDataSource.kt](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/androidMain/kotlin/com/nuvio/app/features/player/ResponseHeaderOverridingDataSource.kt)).
- **Audio language:**
  - Settings are a preferred language, a secondary language, and the special values `default`, `device` and `original`.
  - An alias table maps ISO 639-2/B, 639-2/T and English names to 639-1 (`hin→hi`, `tam→ta`, `tel→te`, …)
    ([PlayerLanguagePreferences.kt](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/commonMain/kotlin/com/nuvio/app/features/player/PlayerLanguagePreferences.kt)).
  - mpv receives the ordered list as `alang` and picks the track itself (MPVPlayerBridge.swift L767-L775). ExoPlayer
    receives `setPreferredAudioLanguages(...)` (L847).
  - **A per-title persisted choice beats the language settings, which beat the server default.** This is unit-tested
    ([PlayerServerAudioTest.kt](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/commonTest/kotlin/com/nuvio/app/features/player/PlayerServerAudioTest.kt)).
- **Subtitles:**
  - Plugin `subtitles[]` are merged with Stremio subtitle add-ons, which are fetched in parallel with a 10 s timeout each.
  - Languages are normalised and labelled "Language (Addon)"
    ([AddonSubtitleLoader.kt#L58](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/commonMain/kotlin/com/nuvio/app/features/player/AddonSubtitleLoader.kt#L58)).
- **Resume cache:**
  - The last stream per title or episode is cached together with its request headers and bingeGroup.
  - URLs that look like they carry expiring credentials are **not** cached
    ([StreamLinkCacheRepository.kt](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamLinkCacheRepository.kt)).
- **Buffer defaults:** 15 s minimum, 45 s maximum, 5 s to start, 3 s after a rebuffer, 10 s back buffer, 100 MB target
  ([PlaybackBufferSettings.kt](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/commonMain/kotlin/com/nuvio/app/features/player/PlaybackBufferSettings.kt)).
- **No watch-party feature.** The repo tree has no party, room or syncplay files
  ([tree](https://api.github.com/repos/NuvioMedia/NuvioMobile/git/trees/cmp-rewrite?recursive=1)).

### 1.2 coveninja/cove: the hardened sandbox and fetch proxy
- **Android sandbox**
  ([AndroidNuvioSandbox.kt](https://github.com/coveninja/cove/blob/master/app/backend/src/androidMain/kotlin/com/coveninja/cove/backend/nuvio/AndroidNuvioSandbox.kt)):
  - QuickJS runs in an `isolatedProcess` service. Fetches cross a Binder `FetchBroker` into the main process.
  - Timeouts: client 14 s; worker deadline 12 s ("shorter than the client's own deadline, so a wedged guest is answered
    rather than cut").
  - Per fetch: `FETCH_TIMEOUT_MILLIS = 8_000` and `MAX_FETCH_BYTES = 20 MiB` (L225-L226); ≤5 redirects, each re-validated
    by `urlPolicy.validate`.
  - Only allowed HTTP methods pass. `host`, `content-length` and `connection` are silently dropped, not rejected
    (L192, L228).
  - Guest logs are capped at 100 lines × 2 000 chars.
- **Policy**
  ([ARCHITECTURE.md](https://github.com/coveninja/cove/blob/master/ARCHITECTURE.md)):
  - Plugin, add-on and proxy URLs are rejected if they are local, private, metadata, userinfo or unsafe redirect targets.
  - "Direct HTTP sources are probed and **proxied only when headers or compatibility handling require it**. Redirects are
    validated one hop at a time, and credentials are stripped when authority changes."
  - Android "lazily starts a narrow, ephemeral loopback media host only when playback needs a URL".
- **Media host**
  ([AndroidPlaybackMediaHost.kt](https://github.com/coveninja/cove/blob/master/app/backend/src/androidMain/kotlin/com/coveninja/cove/backend/playback/AndroidPlaybackMediaHost.kt)):
  - Binds to `127.0.0.1` only.
  - Probes with `Range: bytes=0-0` (800 ms) and forwards Range.
  - Follows at most 6 redirects by hand and drops `authorization`, `cookie` and `proxy-authorization` on a host change
    (L358, L422-L427).
  - I saw no HLS playlist rewriting there **(inferred: it proxies direct files; HLS gets its headers from mpv)**.
- **Fan-out**
  ([NuvioManager.kt#L486-L514](https://github.com/coveninja/cove/blob/master/app/backend/src/jvmSharedMain/kotlin/com/coveninja/cove/backend/nuvio/NuvioManager.kt#L486-L514),
  [NuvioBatchFanOut.kt](https://github.com/coveninja/cove/blob/master/app/backend/src/jvmSharedMain/kotlin/com/coveninja/cove/backend/nuvio/NuvioBatchFanOut.kt)):
  - Budgets: `AGGREGATE_BUDGET_MILLIS = 20_000`, `PER_SCRAPER_CAP_MILLIS = 15_000`, `SCRAPER_CONCURRENCY = 12`,
    `MAX_CONCURRENT_BATCHES = 2`, `SCRAPER_CACHE_MILLIS = 15 min`.
  - Early return when `QUIET_POLLS = 6` × 200 ms pass with ≥ `MIN_EARLY_RESULTS = 3`. Their measurement: "one scraper
    ran took 14 577 ms and … all twenty-seven ran took 14 730 ms — so the whole wait was one straggler".
  - Stragglers still write the per-scraper cache. A no-results answer is cached; a runtime failure is not.
  - `PrefetchService` warms bounded stream caches for the current and next likely titles (ARCHITECTURE.md).

### 1.3 KitsuneKode/kunai (MIT, TS terminal client → mpv): health, failover, HLS relay
- **Three memory layers**
  ([title-provider-health-and-cache-reset.md](https://github.com/KitsuneKode/kunai/blob/main/.docs/title-provider-health-and-cache-reset.md)):
  - **(A) Stream URL cache.**
  - **(B) Global provider health.** A provider becomes `down` after 5+ consecutive failures and is skipped in
    auto-fallback but still tried when it is the user's primary.
  - **(C) Title-scoped health.** Advisory only: it says "last time X worked on this title" and **never silently
    reorders** the user's pick. It suggests after ≥2 consecutive failures, or ≥3 total, plus one successful fallback.
    Retention is 12 h normally and 7 d for parse failures.
- **Health TTL heal and failure rate**
  ([provider-health-policy.ts#L15-L31](https://github.com/KitsuneKode/kunai/blob/main/apps/cli/src/services/playback/provider-health-policy.ts#L15-L31)):
  degraded → healthy after 1 h; down → degraded after 4 h → healthy after 8 h. A sustained failure rate of 0.75 over ≥4
  observations also counts.
- **Reachability gate**
  ([stream-health.ts#L26-L41](https://github.com/KitsuneKode/kunai/blob/main/packages/providers/src/shared/stream-health.ts#L26-L41),
  [stream-reachability.ts](https://github.com/KitsuneKode/kunai/blob/main/packages/providers/src/shared/stream-reachability.ts)):
  - Walks master → first variant → first segment with `Range: bytes=0-N`.
  - Rejects segments served as `text/html` or with a tiny body.
  - Budgets: gate 6 s ("three sequential round trips … measured at 2.1–2.9 s"); preflight 3 s (lenient on timeout).
    A result is stale after 60 s, and a stream is trusted for 5 min after it played.
  - Probe redirects: ≤3 hops, with `authorization` and `cookie` stripped (L27, L230).
- **Failover:** when a pinned stream dies, it first tries a **same-source, same-quality-label sibling**, best rank first
  ([source-quality.ts#L448-L505](https://github.com/KitsuneKode/kunai/blob/main/apps/cli/src/app/playback/source-quality.ts#L448-L505)).
- **Language picker as an inventory projection:**
  - Each language option points at a candidate stream ("Switches to cached stream inventory") and restarts at the resume
    point.
  - The badge comes from the normalised ISO code only; the provider's own label is kept as dim evidence
    ([source-quality.ts#L599-L638](https://github.com/KitsuneKode/kunai/blob/main/apps/cli/src/app/playback/source-quality.ts#L599-L638)).
  - The quality picker is sorted by `qualityRank` (L293-L318).
- **Startup policy**
  ([fast-first spec](https://github.com/KitsuneKode/kunai/blob/main/.archive/superpowers/archive/specs/2026-05-26-kunai-fast-first-provider-selection-design.md)):
  `fast` | `balanced` (default: wait ≤1 000 ms for an already in-flight 1080p+ candidate) | `quality-first` (3–5 s
  budget). Optional enrichment never blocks first play.
- **Playback watchdog**
  ([playback-watchdog.ts#L21-L27](https://github.com/KitsuneKode/kunai/blob/main/apps/cli/src/infra/player/playback-watchdog.ts#L21-L27)):
  - Samples every 2.5 s.
  - Flags a stall after 12 s with no progress, a seek stall after 8 s, a cache stall after 20 s, and network-read-dead
    after 8 s.
  - The classifier maps "no cache speed and nothing buffered ahead" to `expired-stream` and suggests a refresh
    ([playback-failure-classifier.ts](https://github.com/KitsuneKode/kunai/blob/main/apps/cli/src/infra/player/playback-failure-classifier.ts)).
- **HLS relay pattern**
  ([hls-relay.ts](https://github.com/KitsuneKode/kunai/blob/main/apps/cli/src/infra/player/hls-relay.ts)):
  - A loopback server on `127.0.0.1` rewrites every playlist URI **and every `URI="…"` attribute** (keys, maps, media) to
    `/p/<b64>.m3u8` or `/s/<b64>`.
  - Upstream hosts are on an exact apex allowlist. An earlier unanchored regex was exploitable; the comment explains how.
  - Bodies are capped at 64 MiB, the idle timeout is 15 min, and playlists are detected by the `#EXTM3U` magic bytes, not
    by decoding.
  - Its purpose there (CDNs rejecting mpv's client) is out of scope; **the rewrite architecture is what applies to
    Bearoom's iOS header case.**
- **Header hygiene**
  ([mpv-stream-http-headers.ts#L59-L72](https://github.com/KitsuneKode/kunai/blob/main/apps/cli/src/infra/player/mpv-stream-http-headers.ts#L59-L72)):
  header names must match the RFC 7230 token pattern, otherwise they are dropped, because provider-supplied names can
  inject fields. Referer, User-Agent and Origin go through dedicated options.

### 1.4 truelockmc/streambert (6.2k★, Electron)
- Sources are a **static list of embed iframes** (`PLAYER_SOURCES`), each with an optional subtitle-language query
  parameter (`ds_lang`), an accent-colour parameter, and a `progressViaFrames` flag for nested iframes
  ([src/utils/api.js#L123-L182](https://github.com/truelockmc/streambert/blob/main/src/utils/api.js#L123-L182)).
- It sniffs `.m3u8` and `.vtt` URLs with Electron `webRequest.onBeforeRequest` (for downloads) and blocks ad hosts
  ([index.js#L139-L176](https://github.com/truelockmc/streambert/blob/main/index.js#L139-L176)).
- **No health checks, ranking or dub handling.** Dead providers are removed by hand after issues are filed (#180).
  The GitHub `main` branch still lists videasy first even though releases now ship from Codeberg
  ([README](https://github.com/truelockmc/streambert/blob/main/README.md)); I infer the GitHub mirror lags.
- **Lesson:** this is the same embed-iframe shape as Bearoom's current player. Its maintenance model of "remove the
  source when users complain" is what Bearoom is moving away from.

### 1.5 Stremio: the de-facto "stream + headers" contract
- **Stream object**
  ([stream.md](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/stream.md)):
  - `url | ytId | infoHash | …`, plus `name`, `description`, `subtitles[]`, and
    `behaviorHints{countryWhitelist, notWebReady, bingeGroup, proxyHeaders{request,response}, videoHash, videoSize, filename}`.
  - "When using [`proxyHeaders`] you must also set `notWebReady: true`".
  - `bingeGroup`: "if the next episode has a stream with the same bingeGroup, stremio should select that stream
    implicitly".
- **Delivery**
  ([stremio-core stream.rs#L455-L491](https://github.com/Stremio/stremio-core/blob/development/src/types/resource/stream.rs#L455-L491)):
  - When `proxyHeaders` is set and a streaming server is running, the playable URL becomes
    `{server}/proxy/d=<scheme://authority>&h=Name:Value…&r=Name:Value…/<path>?<query>`. Without a server, the raw URL is
    returned and the headers are lost.
  - So **Stremio solves per-stream headers with a local proxy, not in the player.**
  - The proxy only covers the stream's own origin (`d=`). Whether it rewrites HLS playlists that point at other hosts is
    not visible, because the streaming server isn't in stremio-core **(inferred: unknown)**.
- `is_binge_match` compares `binge_group` (L141-L149).

### 1.6 streamyfin/streamyfin (Expo SDK 57, RN-tvOS 0.86): an RN app that wrote its own player modules
- `package.json` has **no expo-video and no react-native-video**
  ([package.json](https://github.com/streamyfin/streamyfin/blob/develop/package.json)). The app ships local Expo modules
  `mpv-player` (iOS and Android) and `exoplayer-player`
  ([modules/](https://github.com/streamyfin/streamyfin/tree/develop/modules)).
- **One TypeScript contract for both engines**
  ([exoplayer-player/index.ts](https://github.com/streamyfin/streamyfin/blob/develop/modules/exoplayer-player/index.ts),
  [MpvPlayer.types.ts](https://github.com/streamyfin/streamyfin/blob/develop/modules/mpv-player/src/MpvPlayer.types.ts)):
  - source `{url, headers, externalSubtitles[], startPosition, initialAudioId, initialSubtitleId, cacheConfig}`;
  - ref methods `seekTo/seekBy/setSpeed/getSpeed`, PiP start/stop/isSupported, `getAudioTracks/…`, `addSubtitleFile`,
    `setSubtitleDelay`.
- It also has a native presented player config with `playMethod` and `transcodeReasons`
  ([NativePlayerPresentation.types.ts](https://github.com/streamyfin/streamyfin/blob/develop/modules/mpv-player/src/NativePlayerPresentation.types.ts)).
- **Lesson:** a mature Expo app keeps one player contract in TypeScript and swaps native engines behind it.

### 1.7 Jellyfin SyncPlay (server + jellyfin-web), the reference for group sync with native or HLS players
- **Clock**
  ([TimeSync.js#L11-L14](https://github.com/jellyfin/jellyfin-web/blob/master/src/plugins/syncPlay/core/timeSync/TimeSync.js#L11-L14)):
  - NTP-style four-timestamp ping. It keeps the last 8 measurements and uses the one with the **lowest delay**.
  - It pings every 1 s for the first 3 pings, then every 60 s.
  - Users can add an `extraTimeOffset`
    ([SettingsEditor.js](https://github.com/jellyfin/jellyfin-web/blob/master/src/plugins/syncPlay/ui/settings/SettingsEditor.js)).
- **Commands**
  ([PlaybackCore.js](https://github.com/jellyfin/jellyfin-web/blob/master/src/plugins/syncPlay/core/PlaybackCore.js)):
  - The server sends `{Command, When (server time), PositionTicks, PlaylistItemId}`. The client converts `When` to local
    time and `setTimeout`s the action.
  - If `When` is already past, it unpauses and seeks to `pos + (now − When)`.
  - Duplicate commands are detected by When/Position/Command/Item and only re-checked against the player's state.
  - A duplicate seek gets ±50 ms of random jitter so the player actually seeks (L225).
  - After an unpause, drift correction is held off for `maxDelaySpeedToSync/2 = 1.5 s`.
- **Drift correction**
  ([PlaybackCore.js#L51-L69, L540-L600](https://github.com/jellyfin/jellyfin-web/blob/master/src/plugins/syncPlay/core/PlaybackCore.js#L51-L69)):
  - SpeedToSync applies when 60 ms ≤ |diff| < 3 000 ms: `speed = 1 + diff/1000` for 1 s, with a minimum speed of 0.2.
  - SkipToSync applies when |diff| ≥ 400 ms and speed is not used.
  - Checks are throttled to one every 1.5 s.
  - **`enableSyncCorrection` defaults to `false`** (L69). The stock web client relies on scheduled commands and on
    re-anchoring at ready and unpause.
- **Buffering debounce**
  ([HtmlVideoPlayer.js#L19, L68-L78](https://github.com/jellyfin/jellyfin-web/blob/master/src/plugins/syncPlay/ui/players/HtmlVideoPlayer.js#L19)):
  a `waiting` event must last **3 000 ms** before `Buffering` is sent. `playing` cancels it and sends `Ready`.
- **Server constants**
  ([Group.cs#L33, L101-L131](https://github.com/jellyfin/jellyfin/blob/master/Emby.Server.Implementations/SyncPlay/Group.cs#L101-L131),
  [IGroupStateContext.cs#L36-L40](https://github.com/jellyfin/jellyfin/blob/master/MediaBrowser.Controller/SyncPlay/IGroupStateContext.cs#L36-L40)):
  `DefaultPing = 500 ms`, `MaxPing = 10 000 ms` (clamped), `TimeSyncOffset = 2 000 ms`, `MaxPlaybackOffset = 500 ms`,
  `MaxCatchUpOffset = 60 000 ms`, `GroupWaitTimeout = 30 000 ms`.
- **Unpause scheduling**
  ([PlayingGroupState.cs#L67](https://github.com/jellyfin/jellyfin/blob/master/MediaBrowser.Controller/SyncPlay/GroupStates/PlayingGroupState.cs#L67)):
  `When = now + max(2 × highestPing, DefaultPing)`.
- **Ready barrier**
  ([WaitingGroupState.cs#L430-L530](https://github.com/jellyfin/jellyfin/blob/master/MediaBrowser.Controller/SyncPlay/GroupStates/WaitingGroupState.cs#L430-L530)):
  - A client's reported time is ignored if it is off by more than 2 s.
  - A "ready" more than 500 ms from the group position gets a corrective `Seek` and the member stays `buffering`.
  - A member catching up after buffering may lag by up to 60 s.
  - While others are still buffering, a ready member gets `Pause` scheduled at `now + delay`.
  - When everyone is ready and the late member is behind by more than 2× ping, **the others resume at `now + delay`**, so
    the late member's playback converges without seeking back.
- **Wait timeout**
  ([Group.cs#L740-L790](https://github.com/jellyfin/jellyfin/blob/master/Emby.Server.Implementations/SyncPlay/Group.cs#L740-L790)):
  after 30 s the group either unpauses without the stragglers (if it was resuming) or goes to `Paused`. Sessions with
  `IgnoreGroupWait` never block.
- **Different streams per member:** commands carry only `PlaylistItemId` and position, so each client plays its own
  direct-play or transcoded stream of the same item **(inferred from the command payload)**. Quality is local.
- **JellyPlay** (Kotlin, ExoPlayer/libmpv/LibVLC, 29★)
  ([syncplay-guide.md](https://github.com/raulshma/jellyplay/blob/main/docs/syncplay-guide.md),
  [player-engines.md](https://github.com/raulshma/jellyplay/blob/main/docs/player-engines.md)):
  - Speed-to-sync for 60–400 ms of drift, skip above 400 ms, ignore below 60 ms.
  - User sync tolerance presets: 50, 100 or 500 ms.
  - Engine is chosen manually per device, with "**No silent fallback**". This contrasts with Nuvio's automatic fallback.

### 1.8 Syncplay (desktop, mpv/VLC/MPC)
- **Constants**
  ([constants.py#L72-L91](https://github.com/Syncplay/syncplay/blob/master/syncplay/constants.py#L72-L91)):
  - Seek and rewind: `SEEK_THRESHOLD = 1 s` (what counts as a user seek); `DEFAULT_REWIND_THRESHOLD = 4 s` (ahead → seek
    back).
  - Slow-down: `DEFAULT_SLOWDOWN_KICKIN_THRESHOLD = 1.5 s`, `SLOWDOWN_RATE = 0.95`, `SLOWDOWN_RESET_THRESHOLD = 0.1 s`.
  - Fast-forward: `DEFAULT_FASTFORWARD_THRESHOLD = 5 s` once behind for `> 5 − 1.75 s`, plus `FASTFORWARD_EXTRA_TIME = 0.25 s`.
  - `DIFFERENT_DURATION_THRESHOLD = 2.5 s`, `SERVER_STATE_INTERVAL = 1 s`, `PROTOCOL_TIMEOUT = 12.5 s`.
- **Client** ([client.py#L434-L518](https://github.com/Syncplay/syncplay/blob/master/syncplay/client.py#L434-L518)):
  - It only ever **slows down** to cover small leads (never speeds up) and rewinds big leads.
  - Fast-forward is only for members who cannot control the room, or who chose "don't slow down with me".
  - Message age is added to the position while playing.
- **Server** ([server.py#L597-L607, L680-L690](https://github.com/Syncplay/syncplay/blob/master/syncplay/server.py#L597-L607)):
  - Room position is the **minimum** over watchers (follow the slowest). In managed rooms it is the minimum over
    *controllers* only, which is the analogue of "the host is the clock".
- **Different files**
  ([utils.py#L394-L400](https://github.com/Syncplay/syncplay/blob/master/syncplay/utils.py#L394-L400)):
  - It warns, but does not block, when filename, size or duration differ (duration by ≥2.5 s).
  - It supports a **per-user time offset** (`setUserOffset`, client.py L503-L510) for different cuts.
  - Readiness is explicit, with unpause modes `IfAlreadyReady | IfOthersReady | IfMinUsersReady` (constants.py L339-L341).

### 1.9 howardchung/watchparty (1 245★, MIT, web)
- Every client reports its timestamp every 1 s, and the server rebroadcasts the full `tsMap` every 1 s
  ([room.ts#L94-L106](https://github.com/howardchung/watchparty/blob/master/server/room.ts#L94-L106)).
- The server only lets `videoTS` move forward, so "a lagging viewer [cannot hold] up the room state" (L812).
- **Leader time** is the maximum of all positions with ≤2 participants, otherwise the **median**
  ([App.tsx#L2010-L2015](https://github.com/howardchung/watchparty/blob/master/src/components/App/App.tsx#L2010-L2015)).
- Laggards **only speed up**: `rate = 1 + delta/10` when delta > 0.5 s, capped at 1.1 (L794-L796). This is skipped for
  live streams and when the room rate is not 0 (auto).
- A manual "sync to leader" seek is available (L1741).

### 1.10 Metastream (samuelmaddock; open source discontinued August 2024, `archive` branch)
- The server state is `{startTime, playbackRate, pauseTime}` plus a `serverClockSkew`. Time is computed as
  `(now − (startTime + skew)) × rate`
  ([mediaPlayer.helpers.ts](https://github.com/samuelmaddock/metastream/blob/archive/packages/metastream-app/src/lobby/reducers/mediaPlayer.helpers.ts)).
- The player seeks when off by **more than 100 ms** (`seekThreshold: 100`).
- `syncOnBuffer` forces play to resume after a `waiting` event. There is no group barrier
  ([metastream-remote-extension/src/player.js#L211-L217](https://github.com/samuelmaddock/metastream/blob/archive/packages/metastream-remote-extension/src/player.js#L211-L217)).

### 1.11 CyTube (calzoneman/sync)
- The server owns the clock: it advances `currentTime` every 1 s and broadcasts a `mediaUpdate` every **5 s**
  ([config.template.yaml#L179-L180](https://github.com/calzoneman/sync/blob/3.0/config.template.yaml#L179-L180)).
- The client seeks when behind by more than `sync_accuracy` (default **2 s**). When ahead by more than 2 s, it seeks back
  to `leader + 1 s` "to account for possible buffering"
  ([update.coffee#L84-L107](https://github.com/calzoneman/sync/blob/3.0/player/update.coffee#L84-L107),
  [data.js#L175](https://github.com/calzoneman/sync/blob/3.0/www/js/data.js#L175)).

### 1.12 expo-video and react-native-video facts (what Bearoom would actually ship)
- **SDK 53 bundles `expo-video ~2.2.3`**
  ([bundledNativeModules.json](https://github.com/expo/expo/blob/sdk-53/packages/expo/bundledNativeModules.json)).
  Audio-track selection (`audioTrack`, `availableAudioTracks`) arrived in 2.2.0
  ([CHANGELOG](https://github.com/expo/expo/blob/main/packages/expo-video/CHANGELOG.md)).
- **iOS headers:** `["AVURLAssetHTTPHeaderFieldsKey": headers]` is passed as an AVURLAsset option
  ([sdk-53 VideoAsset.swift#L31-L33](https://github.com/expo/expo/blob/sdk-53/packages/expo-video/ios/VideoAsset.swift#L31-L33)).
  Caching uses a custom-scheme `ResourceLoaderDelegate` that adds headers itself, but "the cache cannot be used with HLS
  video sources on iOS"
  ([VideoPlayer.types.ts#L340-L346](https://github.com/expo/expo/blob/sdk-53/packages/expo-video/src/VideoPlayer.types.ts#L340-L346)).
  On main (v56+), a `VideoAssetTransportProvider` hook can override asset loading on iOS
  ([main VideoAsset.swift](https://github.com/expo/expo/blob/main/packages/expo-video/ios/VideoAsset.swift)). It is not
  available on SDK 53.
- **Android headers:** an `OkHttpDataSource.Factory` with `setDefaultRequestProperties(headers)` applies to all requests
  ([DataSourceUtils.kt#L27-L43](https://github.com/expo/expo/blob/sdk-53/packages/expo-video/android/src/main/java/expo/modules/video/utils/DataSourceUtils.kt#L27-L43)).
  Media3 1.4.0 ships with the DASH and HLS modules
  ([build.gradle#L21-L27](https://github.com/expo/expo/blob/sdk-53/packages/expo-video/android/build.gradle#L21-L27)).
- **Seek precision on iOS:** SDK 53 sets `currentTime` with `ref.seek(to:)`, which uses default (loose) tolerance
  ([sdk-53 VideoPlayer.swift#L44-L56](https://github.com/expo/expo/blob/sdk-53/packages/expo-video/ios/VideoPlayer.swift#L44-L56)).
  SDK 54 (3.0.16) uses `toleranceBefore: .zero, toleranceAfter: .zero`
  ([sdk-54 VideoPlayer.swift#L55](https://github.com/expo/expo/blob/sdk-54/packages/expo-video/ios/VideoPlayer.swift#L55)),
  per the changelog fix "Setting `player.currentTime` doesn't seek to the correct time on some videos".
- **API gaps (SDK 53 and still on main v58):**
  - `readonly videoTrack` / `availableVideoTracks`, so there is no manual quality selection
    ([types#L193-L210](https://github.com/expo/expo/blob/sdk-53/packages/expo-video/src/VideoPlayer.types.ts#L193-L210)).
  - The event list has no `seeked` or buffering-progress event, only `statusChange`, `timeUpdate`, `sourceLoad` and the
    track events
    ([VideoPlayerEvents.types.ts#L13-L83](https://github.com/expo/expo/blob/sdk-53/packages/expo-video/src/VideoPlayerEvents.types.ts#L13-L83)).
    `timeUpdateEventInterval` defaults to 0 (off).
  - There is no sidecar or external subtitle API.
- **What it does have:** `playbackRate` (0–16) with `preservesPitch` (default true), `bufferOptions`, and
  `staysActiveInBackground` plus `showNowPlayingNotification` (L97-L155). PiP requires the config plugin.
- **react-native-video v6:**
  - `selectedVideoTrack` is **Android-only**. `selectedAudioTrack` works on both platforms.
  - Sidecar `textTracks` "does not work with HLS playlists … on iOS". `maxBitRate` works on both platforms
    ([v6 props](https://docs.thewidlarzgroup.com/react-native-video/docs/v6/component/props)).
  - In v7 (Nitro), audio and video track selection is defined only on `WebVideoPlayer`, "not available on Android or iOS
    native players"
    ([WebVideoPlayer.ts](https://github.com/thewidlarzgroup/react-native-video/blob/master/packages/react-native-video/src/core/types/WebVideoPlayer.ts),
    via Context7).
  - So react-native-video does **not** fix expo-video's iOS gaps.

---

## 2. Sync numbers (side by side)

| System | Clock model | Report/broadcast | Ignore (dead-band) | Rate nudge | Hard seek | Buffering / ready | Wait timeout | Different versions |
|---|---|---|---|---|---|---|---|---|
| **Jellyfin SyncPlay** (server + web) | Server time; NTP-style, min-delay of 8, 1 s×3 then 60 s | Commands with a future `When = now + max(2×maxPing, 500 ms)` | <60 ms | `1 + diff/1000` for 1 s, 60–3 000 ms, min 0.2× (**off by default**) | ≥400 ms when not speeding; ready off by >500 ms → corrective seek | `waiting` must last **3 s** to report; group barrier; catch-up ≤60 s, others delay their resume | **30 s** → start without stragglers or pause | Item-level sync; per-client stream (inferred) |
| **JellyPlay** (SyncPlay client) | Server time | — | <60 ms | 60–400 ms | >400 ms | (server rules) | (server) | — |
| **Syncplay** | Server state every 1 s, plus message age | 1 s; drop after 12.5 s | <1.5 s ahead | **slow only**, 0.95× until <0.1 s | ahead >4 s → rewind; behind >5 s for >3.25 s → seek +0.25 s (non-controllers) | Manual ready; unpause modes (already / others / min users) | — | Warn if duration differs ≥2.5 s; per-user offset |
| **watchparty** | Peer timestamps every 1 s; leader = max (≤2 people) or median | 1 s | <0.5 s | **speed up only**, `1 + Δ/10`, cap 1.1× | Manual "sync to leader" | None (no barrier) | — | Same URL |
| **Metastream** | `startTime + clockSkew`, rate | On change | — | — | >**100 ms** → seek | On `waiting`, force resume | — | Same URL |
| **CyTube** | Server ticks 1 s | Every **5 s** | ≤2 s | — | behind >2 s → seek; ahead >2 s → seek to leader + 1 s | None | — | Same media |
| **Bearoom today** (`services/party/PartySyncEngine.ts` L33-L44) | Anchor + min-RTT server clock (5-ping burst) | Anchor on change | <0.2 s (reset <0.1 s) | 0.9–1.1×, EMA α 0.25, median of 5 | ≥3 s for 3 samples, 8 s cooldown | **Not implemented** ("deferred") | — | One room stream |
| **kunai watchdog** (solo) | — | Sample every 2.5 s | — | — | — | Stall 12 s, seek-stall 8 s, cache-stall 20 s, read-dead 8 s | — | — |

**Reading the table:**
- **Rate band:** Bearoom's 0.9–1.1× matches watchparty's 1.1 cap and is gentler than Syncplay's 0.95.
- **Jellyfin's 0.2–4× correction** exists but is off by default. That suggests aggressive rate correction sounds bad on
  real players (their own TODO comments: "SpeedToSync sounds bad on songs… failing on Safari… hard time keeping up on
  Android Chrome").
- **Hard-seek threshold:** Bearoom's 3 s is in line with CyTube (2 s) and Syncplay (4 s).
- **The missing piece** is the buffering and ready protocol.

---

## 3. Patterns to adopt, mapped to Bearoom components

### 3.1 Plugin host (hidden WebView + native fetch proxy)
1. **Budgets (Cove):**
   - 15 s cap per plugin, 20 s overall budget, ≤12 plugins in parallel. That is tighter than Nuvio's 60 s, and
     Bearoom's own p90 is 4 s and max 47.7 s.
   - Return early when ≥3 results exist and 1.2 s pass with no new answers (6 × 200 ms).
   - Let stragglers finish into a 15-minute per-plugin result cache.
   - Cache empty results; never cache runtime failures.
   - Keep Bearoom's existing "empty in <100 ms = contract failure" rule.
2. **Fetch bridge contract (Nuvio shape):**
   - `fetch(url,{method,headers,body(text|base64),redirect})` → `{ok,status,url,statusText,body,bodyBase64,headers(lowercased)}`.
   - Default the UA when the plugin sends none.
   - Silently drop `host`, `content-length` and `connection` (Cove).
   - Validate header names against the RFC 7230 token set (kunai).
3. **Egress policy (Cove / kunai):**
   - Public addresses only, re-checked on **every redirect hop**, at most 5 hops.
   - Strip `cookie`, `authorization` and `proxy-authorization` when a redirect changes host.
   - 8 s per fetch, 20 MiB per body.
   - Log cap of 100 lines × 2 000 chars.
4. **Pause scrapes during playback (Nuvio):** cancel in-flight plugin runs while the player is buffering or starting, then
   restart them, so plugins don't steal the first-segment bandwidth. The purpose is my inference from
   `setSearchPaused`.

### 3.2 Stream model
5. **Use the Stremio shape inside Bearoom:**
   - `{url, name, description, subtitles[], behaviorHints{notWebReady, bingeGroup, proxyHeaders{request,response}, filename, videoSize}}`.
   - Nuvio's conversion rules: trim, drop blanks and `Range`, set `notWebReady` whenever headers exist.
   - Add host-measured fields that plugins can't be trusted to provide:

     | Field | Meaning |
     |---|---|
     | `container` | `hls-master` / `hls-media` / `dash` / `mp4` |
     | `audioLanguages[]` | normalised ISO 639-1, using Nuvio's alias table (`hin→hi`, `tam→ta`, …) |
     | `muxedAudioCount` | number of audio tracks muxed into the stream |
     | `probedQuality` | not the label: Castle's "1080P" decodes at 720p |
     | `durationSec` | probed duration |
     | `requiredHeaders` | the subset actually needed, not the plugin's declared set |
     | `capability` | `{ios, android}` playability |
     | `expiresHint` | for streams with short-lived credentials |
6. **bingeGroup:** set it to `plugin:lane:quality:language` so the next episode in a party reuses the same family (Stremio,
   Nuvio).
7. **Resume cache (Nuvio):** cache the last stream per title or episode with its headers, but **skip URLs that carry
   expiring credentials** (Cookie-signed MovieBox).

### 3.3 Ranking and health
8. **No opaque scoring; explicit ordering instead.** Nuvio has none at all. kunai uses health, then the user's pick, then
   quality. For Bearoom:
   1. playable on this OS and engine;
   2. language match against the ordered list (hi first);
   3. global health (kunai layer B: down after 5 consecutive failures; heal times 1 h / 4 h / 8 h; failure rate ≥0.75
      over ≥4 observations);
   4. probed quality;
   5. latency.

   Title-scoped health stays **advisory** (12 h, or 7 d for parse failures) and never silently reorders the user's pick.
9. **Reachability gate before handing a stream to the player (kunai):**
   - Walk master → variant → first segment with `Range`, and reject `text/html` or tiny bodies.
   - Budgets: 6 s gate, 3 s preflight. Trust a stream for 5 min after it plays.
   - Add Bearoom's duration check against TMDB runtime here.
10. **Startup policy (kunai):** "balanced" by default, meaning start the best ready stream but wait up to 1 s for an
    in-flight Hindi or 1080p candidate. "Quality-first" gets a 3–5 s budget.
11. **Failover order:**
    1. a sibling from the same source with the same quality label (kunai);
    2. the next ready candidate (Nuvio `autoPlayCandidates`);
    3. re-resolve.

    Never silently fall back across languages.

### 3.4 Language and quality UX
12. **Audio preferences:**
    - An ordered language list plus `original` / `device` (Nuvio).
    - A **per-title remembered choice beats the list, which beats the stream default** (Nuvio's unit test).
13. **Language picker as an inventory projection (kunai):**
    - One row per language, backed either by an in-stream audio track or by a sibling URL with that language.
    - Selecting a sibling URL replaces the source and restarts at the current position.
    - The badge comes from the normalised code only.
14. **Quality:** expo-video can't select video tracks.
    - Default to automatic (ABR).
    - For manual quality, expand the HLS master into variant media playlists (kunai's "ladder expansion") and
      `replaceAsync` the variant URL, then seek.
    - In a party this is local only, so the member resyncs to the room anchor afterwards.
15. **Subtitles:**
    - Merge plugin `subtitles[]` with an optional subtitle-provider fetch (Nuvio: parallel, 10 s timeout each).
    - expo-video has no sidecar API, so Bearoom has to **render VTT/SRT itself in an RN overlay** driven by `timeUpdate`
      **(inferred)**.

### 3.5 Player engine
16. **One `PlayerEngine` TypeScript contract now (Streamyfin), several adapters later:**
    - Source: `{url, headers, startPosition, initialAudio, subtitles[]}`.
    - Methods: `play/pause/seekTo/seekBy/setRate/getRate`, `tracks()`, `selectAudio`, PiP.
    - Events: `{status, time, buffering, seekCompleted}`.
    - Phase 1: an expo-video adapter. Later: a libVLC or mpv adapter.
    - **Pick the engine per stream from the capability matrix (container × OS × required headers × muxed-audio count).**
      Don't fall back silently in a party (JellyPlay); a solo player may auto-fall back with a position handoff (Nuvio).
17. **expo-video adapter shims for its gaps:**
    - **seeked:** derive it from `statusChange` (loading → readyToPlay) together with `timeUpdate` crossing the target.
    - **On SDK 53 iOS:** patch `currentTime` to zero tolerance (backport of the SDK 54 one-liner), **or** treat hard seeks
      as approximate and re-check drift after 2 samples.
    - **Ticks:** set `timeUpdateEventInterval ≈ 0.25–0.5 s` for sync. **(inferred)**

### 3.6 Sync engine (extends `PartySyncEngine`)
18. **Buffering report with a 3 s debounce** (Jellyfin). Short stalls are absorbed by the drift corrector; long ones go to
    the room.
19. **Future-scheduled transitions:** host play, seek and resume are stamped `When = serverNow + max(2 × highest member RTT, 500 ms)`,
    with RTT clamped at ≤10 s (Jellyfin). Members pre-seek while paused and start on time. This fits Bearoom's anchor
    model directly: an anchor with `anchorServerTimeMs` in the future.
20. **Ready barrier with timeout:**
    - After a host seek or a resume from pause, wait for members to report ready, but at most **30 s**. After that, start
      without stragglers (Jellyfin).
    - A ready report more than 500 ms from the target gets a corrective seek.
    - Members can opt out of being waited for (`IgnoreGroupWait`).
21. **Catch-up instead of pull-back:**
    - When a **guest** recovers from buffering, it seeks to the live anchor (CyTube adds +1 s ahead for HLS
      re-buffering).
    - When the **host** buffers, the room waits, because the host is the clock. Jellyfin's "others delay their resume by
      the late member's lag" applies exactly to a host recovering.
22. **Keep Bearoom's correction bands** (dead-band 0.2 s, 0.9–1.1×, hard seek ≥3 s × 3 samples, 8 s cooldown). They sit
    in the consensus range. Add Jellyfin's idempotent-command check, which Bearoom already approximates with epoch/seq.

### 3.7 Party rules
23. **One room stream** that every member can play (intersection of member capabilities). The DASH tier stays Android-only.
    **Quality is local.**
24. **Language switch inside a party:**
    - **In-stream track:** allowed freely, because the timeline is identical.
    - **Different URL:** allowed only if the probed duration is within **±2.5 s** of the room stream (Syncplay's
      threshold). Otherwise warn and either block it or offer an "offset mode" with a per-member time offset (Syncplay's
      `setUserOffset`).

    This matters because Bearoom's measurements already show dubs with different cuts (Pushpa 2 at 176/178/197 vs 225
    min; Pathaan's Bengali dub 10 min short).
25. **Room stream failover:** the host's stream dies → try a same-source sibling first, then a same-language stream with a
    matching duration. Re-anchor at the current position under the next `epoch:seq`.

---

## 4. Risks

1. **iOS headers on segment, key and redirect requests (expo-video).**
   - **The mechanism:** expo-video relies on `AVURLAssetHTTPHeaderFieldsKey`. An Apple engineer: "is not a supported API,
     so you should not use it… use AVAssetResourceLoader"
     ([Apple forum 20421](https://developer.apple.com/forums/thread/20421)).
   - **The evidence conflicts:**
     - [mondominator/sapphoios#105](https://github.com/mondominator/sapphoios/pull/105) (2026-10-06) verified
       `Authorization` on "master, media playlist, init, 100+ segments" in an iOS simulator against a same-host server.
     - [tripsittr/SoundChex#302](https://github.com/tripsittr/SoundChex/pull/302) (same day) reports headers "applies to
       the playlist request only". Its failing case involved a 302 redirect to `/login`.
     - Cookies via `AVURLAssetHTTPCookiesKey` reportedly reach manifest and segment requests **only over HTTPS**
       ([Apple forum 126011](https://developer.apple.com/forums/thread/126011)).
   - **Exposure for Bearoom's measured catalogue:**
     - Vidrock needs `Origin` on the **master only**, which every report agrees is sent.
     - Cookie-gated streams are MovieBox **DASH**, which AVPlayer can't play anyway.
     - So the iOS exposure is mostly **cross-host segments** (Castle `.jpg` segments on another host) and **redirects**
       **(untested)**.
   - **Mitigation if it fails:** a loopback HLS rewrite proxy (kunai pattern: rewrite every URI and `URI=""` attribute,
     exact host allowlist, bounded bodies, idle timeout). Needs an App Transport Security exception for local networking
     **(inferred)**. Stremio does the same with `/proxy/d=&h=`. A custom-scheme `AVAssetResourceLoader` is Apple's
     suggestion but is reported fragile for HLS.
2. **Muxed multi-audio is not switchable on iOS.**
   - Apple staff: "We only support one audio track in a TS file… The rest have to be separated out"
     ([Apple forum 69051](https://developer.apple.com/forums/thread/69051)).
   - Castle and karnis (Mirzapur, 5 AAC tracks in one TS) are the *only* in-stream multi-audio streams measured, so
     `player.audioTrack` switching on iOS has nothing to switch **(untested on device; strongly implied)**.
   - Media3 exposes every extractor track as its own `TrackGroup` (`…:muxed:N`)
     ([HlsSampleStreamWrapper.java#L1513-L1590](https://github.com/androidx/media/blob/release/libraries/exoplayer_hls/src/main/java/androidx/media3/exoplayer/hls/HlsSampleStreamWrapper.java#L1513-L1590)),
     so Android expo-video *should* list them **(inferred from source; untested)**.
   - **Consequence:** on iOS, "members may switch audio tracks" mostly becomes "switch URL", which is governed by the
     ±2.5 s duration rule.
3. **SDK 53 iOS seek imprecision** (expo-video 2.2.3 `seek(to:)` without tolerance). It interacts badly with hard-seek
   correction: a seek may land on a segment or keyframe boundary and re-trigger correction. Patch it, upgrade to SDK 54+,
   or widen the post-seek verification window.
4. **No `seeked` event, and `timeUpdate` is off by default.** The adapter must synthesise seek completion. The current
   HijackPlayer echo-suppression logic won't carry over 1:1 **(inferred)**.
5. **No sidecar subtitles in expo-video, and no iOS caching for HLS.** Subtitles must be rendered in the app.
6. **Disguised segments on AVPlayer:** `.jpg`, `.html` and extension-less segments (Castle, playimdb, zevran), and any
   segment served as `text/html`. libVLC copes; AVPlayer is **(untested)**. kunai's reachability gate rejects `text/html`
   segments, so decide whether that rule would wrongly reject these hosts.
7. **Peer signal:** Nuvio (left RN; iOS is mpv-only) and Streamyfin (Expo; its own mpv and ExoPlayer modules) both bypassed
   expo-video and react-native-video. The "native-player feel" with multi-audio and subtitles may force the libVLC or mpv
   tier sooner than phase 2 **(inferred)**.
8. **Security anti-patterns not to copy:**
   - Nuvio's trust-all TLS on playback.
   - Nuvio's unguarded fetch bridge (no address policy).
   - kunai's own warning about unanchored host regexes in a proxy allowlist.
9. **Over-aggressive rate correction:** Jellyfin ships with it off and its comments list Safari and Android problems.
   Keep Bearoom's 0.9–1.1× and its preserve-pitch default (expo-video `preservesPitch: true`).

---

## 5. Device tests that would settle the open questions
| # | Test | Decides |
|---|---|---|
| T1 | iOS expo-video, Vidrock HLS with `Origin`; Castle HLS with `.jpg` segments on another host; a stream behind a 302 redirect. Log every request at a mitmproxy. | Whether iOS needs the loopback proxy |
| T2 | iOS and Android expo-video on Castle Mirzapur S1E1 (5-track TS): print `availableAudioTracks`, switch to `tam`, confirm audio changes | Whether in-stream audio switching exists on each OS |
| T3 | iOS SDK 53: set `currentTime` to 10 random targets on a playimdb HLS stream and measure landed − target | Size of the seek error; whether a patch is needed |
| T4 | Android expo-video on MovieBox DASH with Cookie (OkHttp default headers) | Android DASH + Cookie confirmed |
| T5 | Two devices: guest buffering with a 3 s debounce, host buffering → room wait, 30 s timeout | Party buffering protocol |

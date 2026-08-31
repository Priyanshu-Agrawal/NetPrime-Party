# Nuvio plugin architecture — fit study & empirical verification

**Date:** 2026-08-29 · **Status:** verified spike, no app changes made
**Related:** [`scraper-poc-postmortem.md`](./scraper-poc-postmortem.md) · [`cooren-fit-adr.md`](./cooren-fit-adr.md) · HANDBOOK §3.4

---

## 0. Verdict

**The old wall is gone. A different one is real, and it is on iOS.**

The postmortem's conclusions were correct *for server-side resolution*, which is what it tested. Nuvio
resolves on the **device**, which structurally removes those blockers — cross-IP testing shows the CDN we
care about has **no IP-lock at all** today, and the plugin runs inside Bearoom's Hermes right now.

But a second round of deeper testing (§6, 10 titles / 395 streams, Hindi-first) found the constraint that
actually decides this: **the catalogue is container-split, and iOS can only play part of it.**

| Question | Result |
|---|---|
| Do these plugins resolve real streams today? | **Yes** — 9–11 providers and 34–58 streams per title, across 10 titles |
| Do the URLs actually play? | **Yes** — 15 s of 3840×2160 h264+aac pulled in 8.2 s, faster than realtime |
| Does it run in our RN app? | **Yes** — Hermes `eval`/`new Function` work; obfuscated plugins run in-app; crypto-js shim proven in-app |
| IP-lock (the old wall)? | **Not present** — 2 MB of media served HTTP 206 to a foreign Tor exit IP, no headers |
| Cloudflare WAF / JA3 (the old wall)? | **Not hit** — plain Node and RN fetch both sailed through |
| Ephemeral non-self-healing tokens (the old wall)? | **Model was wrong** — seed rotates every 30 s, resolved URLs are stable and deterministic |
| Is Hindi content there? | **Yes, abundantly** — 149 of 395 streams carry Hindi/dual/multi-audio labels |
| **Can iOS play it?** | **Mostly NO** — only **43 %** of all streams and **12 %** of Hindi-labelled streams are AVPlayer-compatible |
| **Can Android play it?** | **Partly** — ExoPlayer opens MKV+HEVC, but the test device has **no AC3/E-AC3/DTS decoder**, so the premium Hindi tier plays **silent** |

**Confirmed on device:** iOS AVFoundation returns `canPlayType('video/x-matroska') === ""` and a real Hindi
MKV fails with `MediaError code 4`. The best Hindi audio (Multi-Audio / DD5.1 / HEVC) ships almost
exclusively as **MKV**, which `expo-video` and `react-native-video` cannot play on iOS at all.

**Nuvio hit this same wall and paid for it in native code:** they ship **MPVKit (libmpv) on iOS** — not
AVPlayer — and on Android they run ExoPlayer with an **automatic fallback to libmpv**
(`PlayerEngine.android.kt:157`, "ExoPlayer failed; falling back to libmpv"). That is the real cost of
adopting this catalogue, and it is exactly the kind of thing that surfaces after implementation rather
than before.

**But the wall turned out to be thinner than it looked (§6.5.3c).** iOS *does* decode HEVC, E-AC3 and AC-3
natively — it just cannot open a Matroska container. I stream-copied the hardest Hindi case (HEVC 4K +
E-AC3 6ch, MKV) into MP4 with **no re-encode** and it **played on AVFoundation**. So the fix on iOS is a
demuxer, not a decoder.

The two platforms fail at opposite layers, and both have native-library fixes — **no WebView player is
required for either**:

- **iOS** — needs an MKV demuxer: remux to fMP4 on the fly, or use a player that demuxes MKV itself.
- **Android** — ExoPlayer already demuxes MKV; needs a **software AC3/E-AC3 audio decoder** (Media3's
  FFmpeg extension, or mpv/VLC), because the test device has none in MediaCodec.

**RESOLVED 2026-08-29 (§7.1c): `expo-libvlc-player@3.4.25` plays it, on both platforms.** Built into a
throwaway Expo SDK 53 / RN 0.79.6 / New Arch app and run against the real 4K HEVC + E-AC3 Hindi MKV: it
**plays on the physical Android device** (which has no E-AC3 decoder in MediaCodec — libVLC decodes it in
software) **and on the iOS simulator** (where AVFoundation had refused the same file with `MediaError
code 4`), with **audio-track enumeration and runtime switching working on both**. Cost: **35 MB** of app
size and an **LGPL v2.1** dependency. No WebView, no remux, no local server.

**So the decision is which delivery to fund, not whether it is possible:**

1. **HLS-only subset** — `expo-video` as-is, ~43 % of streams. videasy / playimdb / vidrock hit 9–10 of 10
   titles with clean h264+AAC HLS, and vidrock exposes **per-language Hindi / Tamil / Telugu as separate
   streams**, so Hindi *is* covered. Cheapest; forfeits the 4K multi-audio tier.
2. **Native player + container/codec fix** — unlocks ~79 % (everything except magnets and auth-gated
   hosts). Costs a native dependency on each platform and the licensing questions that come with it.
3. **Android-first** — Android is closer to done, but still needs the audio decoder for the AC3 tier.

---

## 1. What Nuvio is

[NuvioMedia/NuvioMobile](https://github.com/NuvioMedia/NuvioMobile) — a Kotlin Multiplatform / Compose
streaming app (not React Native). Its "Local Scrapers" feature is a third-party plugin system indexed at
`nuvio-plugin-library.vercel.app` (a Notion-backed directory; the site itself holds no code).

### 1.1 Distribution — a repo is one manifest URL

19 community repos are listed. Each is a raw-hosted `manifest.json`; the one studied here is
D3adlyRocket's aggregation repo:

```
https://raw.githubusercontent.com/D3adlyRocket/All-in-One-Nuvio/refs/heads/main/manifest.json
```

`PluginRepository.fetchRepositoryData()` (`composeApp/…/features/plugins/PluginRepository.kt`):

1. GET the manifest → `PluginManifest { name, version, scrapers[] }`.
2. `baseUrl = manifestUrl − "/manifest.json"`; each scraper's `filename` (e.g. `providers/videasy.js`)
   resolves against it, or is used as-is when absolute.
3. GET each scraper's **JS source**, store per-profile on disk (`nuvio_plugin_scrapers/`), keyed
   `"{manifestUrl}:{id}"`.
4. Auto-refresh every 6 h (`PLUGIN_REPOSITORY_REFRESH_INTERVAL_MS`), with manifest-level `enabled` and
   `supportedPlatforms` / `disabledPlatforms` gating.

`AppFeaturePolicy.pluginsEnabled` is `true` on `androidFull` and **`false` on `iosAppStore`** — plugins
ship only in sideload/full builds.

### 1.2 The plugin contract

```js
module.exports = { getStreams }
async function getStreams(tmdbId, mediaType, season, episode) → StreamResult[]
```

`StreamResult`: `{ title, name, url, quality, size, language, provider, type, seeders, peers, infoHash,
headers{}, subtitles[] }`. Optional `onSettings()` returns a settings layout; saved values arrive as
`globalThis.SCRAPER_SETTINGS`.

### 1.3 The runtime — QuickJS on-device, no server

`PluginRuntime.executePlugin` spins up **QuickJS** (`io.github.dokar3:quickjs-kt` 1.0.5) per call with a
60 s timeout, injects a ~970-line polyfill (`JsBindings.kt`), wraps the plugin as
`var module={exports:{}}; (function(){ …code… })();`, calls `getStreams(...)`, and captures
`JSON.stringify(result)` via a host function `__capture_result`.

Host bridges:

| Bridge | Exposes to JS | Backed by |
|---|---|---|
| `FetchBridge` | `fetch()` via `__native_fetch(url, method, headers, body, followRedirects)` | Ktor — **no CORS**, arbitrary Referer/Origin/Cookie/UA, explicit redirect control |
| `DomBridge` | `cheerio` shim (`__cheerio_load/select/find/text/attr/html/next/prev`) | Ksoup |
| `CryptoBridge` | `CryptoJS` + `crypto.subtle` shims (AES, HMAC, PBKDF2, digests, base64) | native crypto |
| `UrlBridge` | `URL`, `URLSearchParams` | Ktor `Url` |
| `HostFunctions` | `console.*`, `__capture_result` | Kermit |
| `WasmBridge` | nothing — explicit TODO placeholder | — |

`require()` resolves **only** `'cheerio'` and `'crypto-js'`; anything else throws. Plus `atob`/`btoa`,
`AbortController`, and `Array.flat/flatMap`, `Object.entries/fromEntries`, `String.replaceAll` polyfills.

### 1.4 Consumption

Results merge into `StreamsRepository` alongside Stremio addons. Per-stream `headers` become
`StreamBehaviorHints(notWebReady = true, proxyHeaders.request = …)` and are handed to mpv as
`http-header-fields` (`PlayerEngine.android.kt:1659`). **That is the whole mechanism for
Referer/Origin-locked CDNs: resolve on-device, replay headers into the native player.**

---

## 2. The repo we studied

`All-in-One-Nuvio` — **61 scrapers**, all single-line
[javascript-obfuscator](https://obfuscator.io) bundles (string-table + `_0x…` indirection). Two families:

- **HTML scrapers** — hdhub4u, 4khdhub, vegamovies, uhdmovies, moviesdrive, animepahe… cheerio + regex
  over site HTML, follow redirectors, emit mkv/mp4.
- **Private-API clients** — videasy (`api.speedracelight.com`), vidsrc (`whisperingauroras.com`),
  vidfast, cineby, showbox, moviebox (`stremio-moviebox-1.onrender.com`), plus a Cloudflare Worker.
  TMDB (baked API key) supplies title/year/imdb/runtime for queries.

The README is an aggregation credit list (Yoruix, Phisher98, PirateZoro9, KennethJYS…). Its own install
URL points at `NuvioPlugin/All-in-One-Nuvio`; the library index uses the `D3adlyRocket` one.

**Dependency profile across all 61** (this drives our sandbox requirements):

| Requirement | Count |
|---|---|
| fetch-only (no `require`) | **47 / 61** |
| needs `cheerio` | 12 / 61 |
| needs `crypto-js` | 5 / 61 |
| needs `redirect: 'manual'` | **3 / 61** (movies4u, vegamovies, vixsrc) |
| sets a custom `User-Agent` | 60 / 61 |

---

## 3. `providers/videasy.js` — deobfuscated

Directly relevant: this is our only currently-hijacked provider, and the plugin resolves it **without a
WebView**.

1. TMDB details (`?append_to_response=external_ids`) → title / year / imdbId / runtime.
2. `GET https://api.speedracelight.com/seed?mediaId={tmdbId}` → `{ seed, ttlMs: 30000 }`.
3. Parallel fan-out across 10 named servers — Hydrogen=`cdn/…`, Titanium=`m4uhd/…`, Oxygen=`neon2/…`,
   Lithium=`downloader2/…`, Krypton=`ym/…`, Carbon=`mb-flix/…`, Aluminium=`lamovie/…`,
   Nitrogen=`tejo/…`, Neon=`superflix/…`, Helium=`1movies/…` — each
   `GET {base}/{path}/sources-with-title?title=&mediaType=&year=&seasonId=&episodeId=&tmdbId=&imdbId=&enc=2&seed={seed}`
   with `Origin`/`Referer` = `https://www.vidking.net`.
4. Response = base64 → XOR against a keystream derived from `(seed, tmdbId)` by a hand-rolled PRNG
   (FNV-1a / murmur-style mixing, RC4-like S-box init, `0x9e3779b9`), validated by a 4-byte magic header
   `mvm1`, then parsed as JSON → `sources[]` + `subtitles[]`.
5. Emits m3u8/mp4 tagged with `Referer`/`Origin`/`User-Agent` headers.

**This is a client-side reimplementation of videasy's `enc=2` + 30 s-seed decryption** — exactly what
`scraper-poc-postmortem.md` concluded had no API shortcut.

---

## 4. Verification log

Harness: `runner.js` (in the session scratchpad) reproduces the QuickJS sandbox in Node —
plain `fetch` (no CORS), cheerio, crypto-js, `console`, `SCRAPER_SETTINGS`, `module.exports` — loads a
plugin file verbatim and calls `getStreams`. Nothing mocked; all requests hit real upstreams.

Host IP during testing: `45.118.156.98` (Delhi, AS133982 Excitel).

### 4.1 Resolution + playback (Node)

- **videasy / Fight Club (550):** 6 streams in 11.5 s → `ffmpeg` pulled **15 s of 3840×2160 h264+aac,
  31 MB, in 8.2 s wall-clock**. Reported duration 8348 s = 139 min ✓ (correct film).
- **Breadth, Inception (27205), all 61 scrapers:** 13 returned streams (52 total). The ~200 ms zeros are
  anime-only scrapers and dead endpoints, not sandbox failures.

| Provider | ffprobe |
|---|---|
| movies4u, movieshunt, uhdmovies | PLAY — 3840×1600 |
| videasy, playimdb, castle, vidrock | PLAY |
| purstream, movix | play (audio renditions listed first) |
| dahmermovies, hindmoviez, vegamovies | 403 / 401 — headers not replayed in that probe |

> **Probe gotcha:** four apparent failures were ffmpeg's HLS extension whitelist rejecting `.jpg`-disguised
> segments, *not* server refusals. `-allowed_extensions ALL -extension_picky 0` fixes it. mpv/ExoPlayer
> don't care. Always re-probe with those flags before calling a source dead.

- **TV:** Breaking Bad S1E1 → videasy 6 (4K, 3501 s), vidrock 4, castle 3 — all play.
- **India-relevant:** 3 Idiots (20453) → 9 scrapers hit; videasy 1080p and 1shows 4K both play; torrentio
  returned 15 torrent results.

### 4.2 The three old walls, retested

**IP-lock — NOT PRESENT.** Tested with Tor (`brew install tor`, SOCKS5 on `127.0.0.1:9050`), exit IP
`45.84.107.101`, a different country from the resolver.

| Test | Result |
|---|---|
| Tor control (example.com, GitHub raw) | 200 / 200 — Tor path healthy |
| 6 locally-resolved master playlists, fetched via Tor | **200 × 6** |
| 2 MB range-GET of real media bytes (`keenanchor.top`), local | `206`, 2 000 001 B, 3.5 MB/s |
| Same range-GET **via Tor** | **`206`, 2 000 001 B** |
| Same **via Tor with no headers at all** | **`206`, 2 000 001 B** |

A URL resolved on the Delhi IP served real media bytes to a foreign exit IP ~20 min later, with no
headers. **There is no IP binding on this CDN today**, and headers were not even required. (Some other
providers *do* need Referer — dahmermovies/hindmoviez 403/401 without it.)

**Cloudflare WAF / JA3 — NOT HIT.** Node's TLS fingerprint is nothing like a browser's; every upstream
(`api.speedracelight.com`, the CDNs, the Workers) answered normally. No challenge pages, no 403s on the
resolve path. Same from RN's native networking stack.

**Ephemeral tokens / "can't self-heal" — MODEL WAS WRONG.** The seed rotates exactly as documented
(`ttlMs: 30000`; observed `59599664.…` → `59599665.…` 35 s apart), but the seed only gates the *API call*,
not the stream. Re-resolving 550 four minutes later **under a different seed produced byte-identical
URLs**, and the original URL still played.

> **Consequence for watch-party:** because resolution is deterministic and content-addressed, every guest
> can resolve locally and land on the *same* URL. We never have to ship a host-resolved URL across IPs.
> (And per the Tor result, we could anyway.)

### 4.3 In-app verification — Bearoom, iOS simulator

Run against the **actual app** (dev build, RN 0.79.6 / Expo 53, New Arch + Bridgeless, Hermes) with
**zero code changes** — everything executed at runtime through the debugger.

Engine capability probe:

```json
{"hermes":true,"typeofEval":"function","evalWorks":2,"newFunctionWorks":4,
 "hasFetch":"function","hasTextEncoder":"function","hasAtob":"function",
 "hasUint8":"function","hasURL":"function"}
```

**Hermes supports `eval()` and `new Function()`.** That was the biggest open question and it is a yes.

Then, in-app:

1. `fetch("https://api.speedracelight.com/seed?mediaId=550")` → `{"seed":"59599707.…","ttlMs":30000}` ✓
2. Fetched `providers/videasy.js` (23 206 bytes, obfuscated), compiled it with
   `new Function("module","exports","console","fetch", code)`, exports `["getStreams"]` ✓
3. `getStreams("550","movie")` → **6 streams in 11 062 ms**, same servers, **same URL prefix as the Node
   run** (`moon.peakstorm.top/vd/OXN3d0w5…`) ✓
4. Device fetched the resulting playlist with the plugin's headers → **HTTP 200, 177 331 bytes, valid
   `#EXTM3U`, in 53 ms** ✓

Multi-plugin parity check (Inception, in-app vs Node):

| Plugin | Node | In-app | |
|---|---|---|---|
| vidrock | 6 | **6** | ✓ |
| movieshunt | 4 | **4** | ✓ |
| playimdb | 3 | **3** | ✓ |
| uhdmovies | 1 | **1** | ✓ |
| 1shows | 0 | 0 | ✓ (consistent) |
| movies4u | 11 | **0** | ✗ — see below |

**The one regression is diagnosed.** `movies4u` uses `redirect: 'manual'`, which React Native's `fetch`
does not honour (iOS always follows redirects). This is precisely why Nuvio built `__native_fetch` with an
explicit `followRedirects` argument instead of using the platform default. It affects **3 of 61** scrapers
today (movies4u, vegamovies, vixsrc) — but it's the reason a native fetch bridge is not optional long-term.

---

## 5. Why this contradicts the postmortem (it doesn't)

`scraper-poc-postmortem.md` tested **server-side** resolution and concluded:

1. IP-locked CDN tokens embed the *resolver's* IP → 403 from the phone.
2. Cloudflare WAF / TLS fingerprinting blocks server `fetch()`.
3. Deterministic sub-hour tokens can't self-heal.
4. videasy is `enc=2`, client-decrypted with a 30 s seed → no API shortcut.

Against on-device resolution: (1) is moot — resolver and player are the same device, and empirically there
is no IP-lock anyway; (2) did not reproduce; (3) is wrong about the resolved URLs (only the seed is
short-lived, and re-resolution is deterministic); (4) is defeated — the plugin reimplements the decrypt in
~23 KB of JS.

The same reasoning retires the `cooren-fit-adr.md` bandwidth argument: the whole ~$500/mo proxy existed to
route bytes through the resolver's IP. On-device resolution removes the need.

---

## 6. Risks and open items

- **Supply chain (the big one).** This model downloads **obfuscated remote JS, auto-refreshes it every
  6 h, and hands it an unrestricted native fetch** with no host allowlist. `eval`/`new Function` in Hermes
  shares globals with the whole app — that is *execution*, not *sandboxing*. Plausibly why Nuvio hard-
  disables plugins on its iOS App Store build. Any adoption needs a curated/pinned repo list at minimum.
- **Legality / ToS.** Unchanged by any of this. Product decision, not a technical one.
- **Durability.** One afternoon of measurements. These repos churn constantly; per-title success is
  uneven (13/61 for one title is normal, not a failure).
- **Not tested:** playback in a native RN player (we have no video component installed — `expo-video`'s
  `VideoSource` does expose `headers?: Record<string,string>` on Android and iOS, verified in expo source);
  Android in-app run (the installed APK is a release build, not debuggable); long-run stability.

---

## 6.5 Round two — the deep verification (the part that changed the answer)

Round one tested 3 titles and asked "does it work". Round two tested **10 titles / 395 streams**, weighted
to our actual audience, and asked "what breaks after we ship it".

### 6.5.1 Title matrix

Every one of the 61 scrapers, run against each title. Hindi originals, Hindi-dub targets, and series:

| Title | TMDB | providers hit | streams |
|---|---|---|---|
| Jawan (hi) | 872906 | 9 | 37 |
| Pathaan (hi) | 864692 | 10 | 44 |
| Animal (hi) | 781732 | 10 | 55 |
| Stree 2 (hi) | 1112426 | 11 | 52 |
| Dangal (hi) | 360814 | 10 | 37 |
| Avengers: Endgame (dub target) | 299534 | 9 | 58 |
| Oppenheimer (dub target) | 872585 | 10 | 50 |
| Deadpool & Wolverine (dub target) | 533535 | 6 | 34 |
| Mirzapur S1E1 (hi) | 84105 | 7 | 16 |
| The Family Man S1E1 (hi) | 93352 | — | 12 |

Coverage is not the problem. **9–11 providers per title, consistently.**

### 6.5.2 The container split — the actual blocker

```
container mix, 395 streams        iOS (AVPlayer)   Android (ExoPlayer)
  HLS .m3u8      87               ✅               ✅
  MP4            19               ✅               ✅
  MKV            48 + 60 pixeldrain  ❌ NOT AT ALL  ✅
  magnet/torrent 62 + file-host   ❌ (needs debrid) ❌
```

| | iOS-playable | Android-playable | Hindi-labelled | Hindi **and** iOS-playable |
|---|---|---|---|---|
| all 395 streams | **170 (43 %)** | **296 (75 %)** | 149 (38 %) | **18 (12 % of Hindi)** |

Two titles (Animal, Stree 2) returned **zero** iOS-playable Hindi streams.

**Device-verified on iOS 26.5** (probe page served to the simulator, AVFoundation via WebKit):

```
canPlayType('video/mp4; codecs="avc1.42E01E"')      → "probably"
canPlayType('application/vnd.apple.mpegurl')        → "maybe"
canPlayType('video/x-matroska')                     → ""      ← NO
canPlayType('video/x-matroska; codecs="hvc1,ec-3"') → ""      ← NO

live load, Jawan 2160p Hindi DD5.1 HEVC .mkv (5.4 GB, Content-Type: video/x-matroska)
  → ERROR code=4   (MEDIA_ERR_SRC_NOT_SUPPORTED)
live load, videasy HLS for the same film
  → LOADED, duration 10 239 s ✓
```

### 6.5.3 What the Hindi audio actually looks like

`ffprobe` on the real streams:

| Source | Video | Audio | Container | iOS |
|---|---|---|---|---|
| movieshunt / Stree 2 | HEVC 3840×1600 | **eac3 6ch `language=hin`** + eng subs | matroska | ❌ |
| 1shows / Jawan | HEVC 3840×1608 | **aac 6ch `language=hin` "Hindi DD5.1-384Kbps"** | matroska | ❌ |
| videasy / Jawan | h264 1920×1080 | aac 2ch, single muxed track | HLS | ✅ |
| vidrock / Pathaan `[Hindi]` | h264 multi-variant | aac 2ch, single muxed track | HLS | ✅ |

**The good Hindi audio and the unplayable container are the same streams.** That is the finding.

**Two usable patterns do survive on iOS:**
- **vidrock publishes each dub as its own stream** — `[Hindi]`, `[Tamil]`, `[Telugu]`, `[Bengali]` — so
  language selection becomes stream selection, no audio-track API needed. Present on Endgame too.
- **einthusan** does the same with MP4 (Hindi / Tamil / Telugu variants).
- HLS audio *renditions* (`#EXT-X-MEDIA:TYPE=AUDIO`) exist only on **movix**, and only French/English.
  No provider offers Hindi as a selectable HLS audio track.

### 6.5.3b Android is not a safe harbour either — the audio codec trap

I checked the **actual test device** (A063, Android 15, Qualcomm Lahaina) by reading its
`/vendor/etc/media_codecs*.xml`:

```
video decoders : OMX.qcom.video.decoder.hevc, c2.qti.hevc.decoder …   ✅ HEVC fine
audio decoders : mp4a-latm (AAC), mpeg (MP3), flac, opus, vorbis,
                 amr-wb, 3gpp, g711-alaw/mlaw, raw
                 → NO ac3, NO eac3, NO dts, NO truehd
```

Grep for `ac3|eac3|dts` across every codec XML on the device: **no matches.**
`MediaCodecList` exposes zero E-AC3 entries.

And the premium Hindi tier is exactly those codecs:

| Stream | Audio tracks | Plays on this device? |
|---|---|---|
| movieshunt / Stree 2 | `eac3 6ch hin` | ❌ video only, **silent** |
| vegamovies / Endgame | `ac3 6ch hin` + `truehd 8ch eng` | ❌ **silent** |
| movieshunt / Deadpool 3 | `eac3 hin` + `eac3 tam` + `eac3 tel` + `eac3 8ch eng` + `ac3 eng` | ❌ **silent** |
| 1shows / Jawan | `aac 6ch hin` | ✅ plays |

So "Android reaches 75 %" is **too generous**. ExoPlayer opens the MKV container and decodes HEVC, but
without an AC3/E-AC3 decoder those files play as video with no sound. ExoPlayer's AC3 support depends on
the device's MediaCodec, not on ExoPlayer — and this device has none. That is precisely why Nuvio's Android
path falls back to libmpv (`"ExoPlayer failed; falling back to libmpv"`), which decodes AC3/E-AC3/TrueHD in
software.

**Net:** the richest Hindi multi-audio content is unplayable on iOS (container) *and* silent on this
Android device (codec), unless a software decoder ships with the app. The HLS tier — h264 + AAC — is
universally playable on both.

### 6.5.3c The breakthrough — iOS has the decoders, it only lacks the demuxer

The MKV failure looked fatal until I probed *which layer* actually fails. Full codec matrix, run on the
iOS 26.5 simulator:

```
MP4 container
  video/mp4; codecs="avc1.640028"          → probably     ✅
  video/mp4; codecs="hvc1.1.6.L93.B0"      → probably     ✅  HEVC fine
  video/mp4; codecs="hvc1,ac-3"            → probably     ✅  AC-3 fine
  video/mp4; codecs="hvc1,ec-3"            → probably     ✅  E-AC3 fine
  video/mp4; codecs="avc1,dtsc"            → NO               (DTS unsupported)
HLS
  …mpegurl; codecs="hvc1,ec-3"             → probably     ✅
audio alone
  audio/mp4; codecs="ec-3" / "ac-3"        → probably     ✅
MKV
  video/x-matroska (any codec string)      → NO           ❌
```

**iOS decodes HEVC and E-AC3/AC3 natively. It simply cannot open a Matroska container.** The blocker is
the demuxer, not the codecs — a far lower bar than "we need full software decoding".

**Proved it by remuxing.** Took the hardest real case — movieshunt / Stree 2, MKV, HEVC 3840×1600 +
E-AC3 6ch Hindi — and stream-copied it into MP4 with no re-encode:

```
ffmpeg -i <mkv> -t 40 -map 0:v:0 -map 0:a:0 -c copy -tag:v hvc1 -movflags +faststart
  → 40 s of 4K in 6.9 s wall-clock, 30 MB   (~5.8× realtime, demux/mux only — no decode)
  → out: hevc/hvc1 3840×1600 + eac3/ec-3 6ch TAG:language=hin
```

Served to the simulator:

```
plain MP4        → LOADED 3840×1600  dur=40.1 s  — PLAYING  ✅
fragmented MP4   → LOADED 3840×1600  dur=40.2 s             ✅
```

Video frames rendered on screen. **The premium Hindi tier plays natively on iOS once the container is
rewrapped.** No WebView, no re-encode, no software video decoder.

The two platforms fail at opposite layers, and both are fixable with native libraries:

| | container | codecs | fix |
|---|---|---|---|
| **iOS** | ❌ can't demux MKV | ✅ HEVC + E-AC3 + AC3 all supported | an MKV demuxer — remux to fMP4, or a player that demuxes (VLC/mpv) |
| **Android** | ✅ ExoPlayer demuxes MKV | ❌ no AC3/E-AC3/DTS decoder on the test device | a software audio decoder (Media3 FFmpeg extension, or mpv/VLC) |

### 6.5.3d Is on-device remux actually affordable? — measured, yes

Stream-copy remux of the 4K HEVC + E-AC3 Hindi MKV, **120 seconds of content**:

| output | wall | **CPU (user+sys)** | peak RSS |
|---|---|---|---|
| fragmented MP4 | 37.8 s | **1.60 s** | 37 MB |
| HLS, fMP4 byte-range segments | 32.3 s | **1.52 s** | 137 MB |

**~1.5 s of CPU per 120 s of 4K video — about 1.3 % of one core.** Wall time was entirely network
(172 MB pulled in 37 s ≈ 37 Mbps); the transcode cost is nil because nothing is decoded. Even an order of
magnitude slower on a phone this is negligible. Use multi-file segments rather than `single_file` to keep
RSS near the 37 MB figure.

**The full pipeline was validated on iOS**, not just the file: remux → local HLS (`#EXT-X-MAP` +
`#EXT-X-BYTERANGE` fMP4) → served over localhost → AVFoundation:

```
LOADED dur=120.1s → PLAYING at 0.0s → seek to 75s → SEEKED ok → PLAYING at 75.0s
```

Frames rendered. **Playback and seeking both work.**

**So CPU is not the constraint. Three other things are:**

1. **The dependency is orphaned.** `arthenica/ffmpeg-kit` was **archived 2026-07-02**; the README points to
   `FFmpegKitNext` by the same author. There is **no canonical React Native package** for it — npm now
   carries ~12 unaffiliated community forks (`@wokcito/…` 6.1.2, `react-native-ffmpeg-kit` 6.1.2,
   `kroog-…`, `@nikhil-cephei/…`, `ffmpeg-kit-react-native-community`, …), none authoritative; the official
   `ffmpeg-kit-react-native` is stale at 6.0.2 (2025-01-21). Expo's
   `@config-plugins/ffmpeg-kit-react-native` **is** current (11.0.0, 2026-08-01), so the path is alive —
   but we would be picking a fork for a core playback dependency.
2. **Licensing.** FFmpegKit is **LGPL v3** by default and **GPL v3** only for `-gpl` variants (x264/x265/
   xvid/vid.stab). Remuxing needs the `min` variant — no encoders — so LGPL v3, manageable with dynamic
   linking. Binary sizes are **not published** in the README; unverified.
3. **Seek beyond the remuxed window.** My test pre-remuxed a fixed 120 s, so the VOD playlist was complete.
   A live progressive remux only knows what it has already read; seeking further needs either the MKV Cues
   index (to build the playlist without downloading the file) or a re-remux from the target keyframe. **This
   is the real engineering, not the CPU.** A player that demuxes MKV itself (mpv/VLC) has none of this
   problem — it seeks in the source directly.

**And remux does not help Android at all** — Android lacks the *decoder*, not the demuxer. Rewrapping an
E-AC3 track into MP4 still leaves nothing to decode it. Android's fix is a software audio decoder
(Media3's FFmpeg extension), which is a different use of the same library.

### 6.5.3e WHOLE-LIBRARY PROVIDER AUDIT — which providers to actually lock into

All **19 repos** in the Nuvio plugin library were fetched (17 live, 2 × 404: Nvmindl, Fenix).
**227 unique scraper ids**; **152 declare Hindi and/or English** and were downloaded and executed.

**Phase 1 — cull (152 scrapers × 3 probe titles): 111 of 152 returned nothing at all.** Most of this
ecosystem is dead, regional, or narrow. 41 survived.

**Phase 2 — 41 survivors × 9 titles** (Jawan, Pathaan, Stree 2, Animal, Endgame, Oppenheimer,
Deadpool 3, Mirzapur S1E1, Breaking Bad S1E1), proper season/episode:

| provider | hits | streams | iOS-native | avg ms | note |
|---|---|---|---|---|---|
| **vidrock** | **9/9** | 44 | **84 %** | 9 247 | the Hindi/Tamil/Telugu backbone |
| **evyrith** | **9/9** | 40 | **83 %** | 9 488 | *cleaner wrapper on the same Vidrock backend* — labels streams `Vidrock • Hindi/Tamil/Telugu` |
| **playimdb** | **9/9** | 27 | **100 %** | **701** | fastest by 5×; single "Original-Audio" stream, no language variants |
| nuvio-movix | 8/9 | 12 | 100 % | 3 530 | |
| movix | 5/9 | 5 | 100 % | 698 | fast |
| xandril | 5/9 | 5 | 100 % | 17 563 | slow |
| castle | 4/9 | 18 | 100 % | 1 399 | + Tamil/Telugu |
| zevran | 4/9 | 12 | 100 % | 768 | fast |
| 1shows | 5/9 | 55 | **0 %** | 7 947 | all MKV — needs libVLC |
| movieshunt | 3/9 | 12 | 0 % | 3 750 | MKV multi-audio tier |
| torrentio | 3/9 | 42 | 0 % | 594 | magnets — needs debrid |

**Hindi coverage, measured per title** (a stream actually *named* Hindi):

```
evyrith          4/9 titles   animal, breakingbad, endgame, jawan
nuvio-4khdhub    2/2          deadpool3, endgame
mavonyx          2/2          jawan, oppenheimer
karnis           1/3          pathaan
```

**The decisive verification — real audio, not labels.** `ffprobe` on evyrith's Endgame streams:

```
Vidrock • Hindi   dur=10869s  audio = aac,2,hin   ← real Hindi, tagged in the manifest
Vidrock • Lyra    dur=10869s  audio = aac,2,eng
Vidrock • Tamil   dur=10894s  audio = aac,2,tam
Vidrock • Telugu  dur=10894s  audio = aac,2,tel
```

181 min = Endgame's exact runtime → correct content, and **all HLS/AAC stereo — 100 % iOS-native.**
**Hindi dubs of Hollywood titles play on plain `expo-video`; libVLC is not needed for this tier.**

**Two caveats found by probing, not assumed:**
1. **Language tags are inconsistent.** Endgame's streams carried `hin`/`eng`/`tam`/`tel` tags; the *same
   provider's* Jawan and Oppenheimer streams had **no language tag at all** — only the stream *name* said
   "Hindi"/"Tamil". **Trust the provider's label for selection; treat manifest tags as a bonus.**
2. **Hindi is not guaranteed per title.** Oppenheimer offered Bengali/Tamil/Telugu but **no Hindi**.

**And a live fragility demonstration:** `videasy` worked at 13:17 and 14:29 today (6 streams / 11 s) and its
upstream `api.speedracelight.com` was **fully down by 16:15** — DNS resolves, TCP connects in 10 ms, no HTTP
response in 20 s, while GitHub answered in 36 ms. **The single provider Bearoom depends on today died
mid-session.** That is the argument for the whole multi-provider design, observed rather than argued.

**Recommended lock-in set:**

| tier | providers | why |
|---|---|---|
| **core (always run)** | **evyrith**, **playimdb**, **vidrock** | 9/9 titles each, 83–100 % iOS-native; evyrith/vidrock carry Hindi/Tamil/Telugu as separate streams |
| **fast fill** | movix, zevran, castle, nuvio-movix | sub-1.5 s, 100 % HLS, widen coverage cheaply |
| **quality tier (needs libVLC)** | 1shows, movieshunt | 4K HEVC multi-audio MKV incl. Hindi DD5.1 |
| **keep as backup** | videasy | currently down; re-enable via health checks |
| **blacklist** | anikototv, animekai | return confidently-labelled wrong content |
| **ignore** | torrentio, uhdmovies, hindmoviez | magnets / auth-gated hosts |

Note **evyrith and vidrock are the same upstream** — count them as one point of failure, not two.

### 6.5.4 Provider quality — a curated allowlist is mandatory

Duration cross-check against TMDB runtime (±8 min):

| Provider | titles hit /10 | streams | iOS-native | content correct |
|---|---|---|---|---|
| **playimdb** | 10 | 30 | **100 % HLS** | **7/7 ✓** |
| **videasy** | 9 | 43 | **100 % HLS** | **6/6 ✓** |
| **vidrock** | 10 | 33 | 76 % HLS | 3/4 ✓ (1 off by 11 min) |
| castle | 4 | 17 | 100 % HLS | 3/3 ✓ |
| cineby | 3 | 12 | 100 % HLS | 3/3 ✓ |
| netmirror / einthusan / movix / purstream | 2–4 | 4–11 | 100 % MP4/HLS | not fully probed |
| 1shows | 6 | 63 | **0 %** (MKV) | — |
| movieshunt / vegamovies / dahmermovies | 2–4 | 5–22 | **0 %** (MKV) | — |
| torrentio / uhdmovies / hindmoviez | 1–5 | 8–62 | **0 %** (magnet / file-host) | — |
| **anikototv** | 8 | 8 | 100 % HLS | **0/5 — always a 13-minute clip** |
| **animekai** | 1 | 10 | 100 % HLS | **0/1 — 55 min for a 201 min film** |

`anikototv` returns confidently-labelled garbage for **every** title tested. Shipping this repo unfiltered
would put wrong content in front of users. **An allowlist is not optional.**

### 6.5.5 Latency

87 successful resolves: **median 2.2 s, p90 11.7 s, max 24.2 s.** Per provider, playimdb averages 0.69 s
and videasy 12.7 s (max 24.2 s). In-app on the simulator: playimdb 457 ms, videasy 11.2 s, vidrock 21.0 s.

Racing providers in parallel and rendering the first hit keeps time-to-first-stream near 1–2 s. Waiting for
all of them does not.

### 6.5.6 More in-app results (iOS simulator, zero code changes)

- **Jawan (Hindi) resolved in-app**: videasy 5 HLS / 11.2 s, vidrock 5 (incl. the `[Hindi]` variant) / 21.0 s,
  playimdb 3 HLS / 0.46 s.
- **crypto-js shim proven in-app**: fetched the 60 KB UMD from cdnjs, ran it through `new Function`,
  `MD5("abc") = 900150983cd24fb0d6963f7d28e17f72` ✓ and an AES round-trip ✓ — then `movieblast`
  (crypto-js-dependent) resolved 2 streams in 254 ms.
- **`castle` threw in Hermes** (`Cannot read property 'replace' of undefined`) while working in Node — a
  reminder that Node parity is not Hermes parity, and every plugin needs a per-plugin failure guard.
- **Plugins have no internal timeout.** One left a `Promise.all` pending indefinitely. Nuvio wraps every
  execution in a 60 s `withTimeout`; we must too.

### 6.5.7 cheerio in React Native — solved, but only via the slim entry

`cheerio@1.2.0`'s default entry requires `node:stream`, `undici`, `encoding-sniffer` and
`parse5-parser-stream` — it will not bundle cleanly for Hermes. **`cheerio/slim` has none of those**
(verified against the installed package) and is the entry to use. The RN forks Nuvio's shim aliases —
`react-native-cheerio` (1.0.0-rc.4, 2022) and `cheerio-without-node-native` (1.0.0-rc.2, 2022) — are both
abandoned; do not adopt them.

### 6.5.8 A methodology note worth keeping

Two of my own measurements were wrong before they were right, both times making sources look dead:

- Running 8 `ffprobe` processes in parallel against one CDN produced a wall of PROBE-FAIL. Serially, the
  same URLs returned in full. **Never conclude "source is dead" from a parallel probe run.**
- A zsh `${ref:+-headers "..."}` expansion word-split the header argument and silently broke every probe.

Both were caught only by re-testing a single case by hand. Re-probe serially before believing a failure.

---

## 7. Sandbox options (surveyed 2026-08-29, registry/source-verified)

> **RESOLVED — see §7.1d.** Both viable candidates were built and benchmarked on the real device. The
> **hidden WebView sandbox wins by 300–1 600×** on execution speed, returns identical results, and needs no
> new dependency; **QuickJS compiled to asm.js is a dead end on performance** despite perfect language
> coverage and a working interrupt handler. The section below is the survey that led there.

`eval` / `new Function` **works** (§4.3) and is enough for a spike, but Hermes has **no isolation
primitive at all** — same Realm, same `globalThis`, same intrinsics. A hostile plugin overwriting
`Array.prototype.map` or reaching our MMKV/Supabase globals owns the app. Fine for measurement, never for
shipping untrusted code.

Why `eval` is even available: Hermes' `RuntimeConfig.h` defaults `EnableEval` to `true`, and RN 0.79's
bridgeless `HermesInstance.cpp` builds its config without `withEnableEval(false)`. Note Hermes implements
**global eval only** — [hermes#1515](https://github.com/facebook/hermes/issues/1515) (local eval) is still
open. Irrelevant to us since we pass everything as `new Function` parameters.

| Option | Version / date | New Arch | Isolation | CPU+mem limits | Verdict |
|---|---|---|---|---|---|
| **Hidden `react-native-webview`** | 13.13.5 installed (latest 14.0.1) | ✅ proven in this app | **OS process** (WKWebView / Android renderer) | crash-isolation only | 🥇 ship-this-week |
| **`@jitl/quickjs-asmjs-mjs-release-sync`** | 0.32.0, 2026-02-16 | pure JS, no native | separate realm | ✅ `setMemoryLimit` + `setInterruptHandler` | 🥈 only option with real limits |
| **`react-native-quickjs-sandbox`** (ByteKen) | 1.0.1, 2026-07-19, **3 stars** | ✅ New-Arch-only (JSI) | separate QuickJS runtime | ❌ **none** | 🥉 fork-and-harden, 2–3 wks |
| `react-native-quickjs` (bojie-liu) | 0.0.2, **2023-06-13** | ❌ | — | — | **dead**, all 5 forks dead |
| `react-native-v8` | 2.5.1, **2024-08-20**, RN 0.75 max | ❌ | replaces engine anyway | — | abandoned |
| ShadowRealm | Stage 2.7, repo idle since 2025-02 | — | — | — | no Hermes support |
| `isolated-vm` / `vm2` | Node-only | — | — | — | can't load in RN; vm2 security-abandoned |
| WASM QuickJS variants | — | — | — | — | **Hermes has no WASM** |

**Hermes still has no WebAssembly.** [hermes#429](https://github.com/facebook/hermes/issues/429) has been
open since 2020-12-04; the official RN 0.84 release post does not mention WASM. Blog claims to the
contrary are unverified. So every WASM-based QuickJS wrapper is out.

**Nobody has packaged "run untrusted plugins in RN."** npm and GitHub searches turn up nothing usable —
`react-native-sandbox` is an unrelated 2022 UI grid package. We are building this.

### 7.1 Recommended path

**Hidden WebView + native fetch proxy.** Uses `react-native-webview` (already a dependency, already proven
on New Arch here as the hijack player), needs zero native code, and gives real OS-process isolation — a
runaway plugin hangs a WebView we can reload, not our JS thread. Load `about:blank`/`srcDoc`, shim
`fetch`/`console` over `postMessage`, run `new Function('module','exports',src)` **inside the page**, bundle
cheerio + crypto-js into it.

- *Biggest risk:* message throughput and iOS content-process kills. Every scraped page crosses a
  JSON-string boundary twice; WKWebView content processes get reaped under exactly the memory pressure our
  video playback creates ([expo/expo#46374](https://github.com/expo/expo/issues/46374)). **Day-one
  benchmark: proxy one real 500 KB scrape end-to-end and measure wall-clock + peak memory while a video
  plays.** Chunking large bodies is likely mandatory.

**Fallback with real limits:** `@jitl/quickjs-asmjs-mjs-release-sync` — QuickJS compiled to *pure JS*, no
WASM, Metro-bundlable, OTA-updatable, and the only option offering `setMemoryLimit` /
`setInterruptHandler` / deadline kill. Static analysis is encouraging (no `eval`/`new Function`,
self-stubbed `WebAssembly`, guarded `TextDecoder`); the one blocker is an unconditional `import.meta.url`
that needs a `patch-package`/Babel fix. Async `fetch` works via `QuickJSDeferredPromise` +
`executePendingJobs()` on the sync variant.

- *Biggest risk:* performance and zero prior art — a JS-compiled interpreter inside a JIT-less interpreter,
  plus ~2 MB of bundle. **Gate:** patch `import.meta`, get `evalCode('1+1') === 2` on-device, then time
  `cheerio.load()` over a real 300 KB page. If that exceeds ~5 s, kill it.

### 7.1b Player survey — what can actually play this catalogue in RN (2026-08-29)

Source: the React Native Directory API (`/api/libraries?search=…`, 36 hits for "player") cross-checked
against npm and the GitHub API.

| Package | ver / date | ★ | New Arch | verdict |
|---|---|---|---|---|
| **`expo-libvlc-player`** | 3.4.25 line; latest 57.0.23 (2026-08-29) | 38 | ✅ | **best fit — see below** |
| `react-native-vlc-media-player` | 1.0.98, 2025-11-28 | 455 | ? undeclared | healthy repo (216 forks, 9 open issues) but 9 months stale; New-Arch status unknown |
| `react-native-video` | 6.19.2, 2026-08-12 | 7 715 | ✅ | AVPlayer on iOS → **cannot open MKV**; Android/Media3 still needs an AC3 decoder |
| `expo-video` | 57.x, 2026-08-27 | — | ✅ | same AVPlayer limit (this is what we'd otherwise use) |
| `react-native-theoplayer` | 11.6.0, 2026-08-06 | 104 | ✅ | peer-depends on `theoplayer@^11.4.0` — a **commercially licensed SDK**; BSD-3 wrapper only |
| `react-native-libmpv` | 0.8.9, 2025-08-27 | 0 | — | **repo is ARCHIVED**, 0 stars, 0 forks — dead, rule out |
| `react-native-nitro-player` | 1.6.1, 2026-08-26 | 149 | ✅ | **audio only** (playlists, CarPlay/Android Auto) — not a video player |
| `ffmpeg-kit-extended` | 0.6.1, 2026-08-20 | 63 | ✅ | maintained FFmpegKit successor with TurboModule bindings, LGPL-2.1 — but **peer-requires RN ≥ 0.81.6**; we are on 0.79.6 |
| `bitmovin-player-react-native`, `@jwplayer/…`, `amazon-ivs-…` | current | 17–312 | — | commercial/licensed SDKs, DRM-oriented; not aimed at arbitrary MKV |

No mpv-based package exists in the directory at all.

**`expo-libvlc-player` is an unusually exact fit for our stack.** Version 3.4.25's own
`devDependencies` pin **`expo: ~53.0.27`** and **`react-native: 0.79.6`** — the precise versions this app
runs. (The 57.x line targets SDK 57 / RN 0.86; the 4.x–8.x lines target RN 0.83.) Repo is active — pushed
2026-08-29, 38★, 9 forks, 2 open issues, MIT wrapper, with an Expo config plugin (`app.plugin.js`), and it
pulls **MobileVLCKit 3.7.3** on iOS.

Its API covers exactly what the multi-audio Hindi tier needs:

| Prop / event | Use |
|---|---|
| `source` | stream URL |
| **`options: string[]`** | raw libVLC CLI options → `--http-referrer=`, `--http-user-agent=`, `--network-caching=` |
| **`tracks: { audio?, video?, subtitle? }`** | runtime **audio-track selection by id** |
| **`onESAdded → MediaTracks { audio[], video[], subtitle[] }`** | enumerate available tracks |
| `slaves` | attach external audio/subtitle files |
| `rate`, `time`, `volume`, `mute`, `playInBackground`, `audioMixingMode`, `repeat`, `autoplay`, `contentFit` | player control |
| `onPlaying/onBuffering/onPaused/onTimeChanged/onPositionChanged/onEncounteredError` | state |

**libVLC's capability confirmed against our real stream** (desktop VLC, same file — movieshunt / Stree 2):

```
mkv demux: Track CodecId = V_MPEGH/ISO/HEVC
mkv demux: Track CodecId = A_EAC3        Track Language = 'hin'
videotoolbox decoder: Using Video Toolbox to decode 'hevc'   ← HARDWARE video decode
main decoder: using audio decoder module "avcodec"  (eac3)   ← software audio decode
main audio output: input 'eac3' 48000 Hz 3F2R/LFE            ← 5.1 Hindi
main decoder: using spu decoder module "subsdec"             ← subtitles
```

That is the whole problem solved with one dependency, on both platforms: **MKV demuxed, HEVC decoded in
hardware (no battery penalty), E-AC3 decoded in software, tracks enumerable and selectable.**

### 7.1c RUNTIME-VERIFIED — it plays the Hindi 4K MKV on both platforms

A throwaway Expo app (`expo ~53.0.27`, `react-native 0.79.6`, New Arch, `expo-libvlc-player@3.4.25`) was
built and run against **the real movieshunt / Stree 2 stream** — MKV, HEVC 3840×1600, E-AC3 6ch Hindi.

**Android — the actual test device (A063, Android 15, the one with NO AC3/E-AC3 decoder in MediaCodec):**

```
BUILD SUCCESSFUL in 1m 19s → installed com.scratch.vlctest on A063
logcat: VLC video output producing frames ("EglImage dataspace changed" loop)
        AudioFocusManager → USAGE_MEDIA / CONTENT_TYPE_MOVIE, AudioTrack session 169
onESAdded → audio:[{id:-1 Disable},{id:1 "(Movies4u.Vip). - [Hindi]"}]
            subtitle:[{id:2 "… - [English]"}]  video:[{id:0 …}]
```

Video frames rendered on screen — the film's disclaimer card, in English **and Devanagari**. **libVLC
decoded E-AC3 in software on a device whose MediaCodec has no E-AC3 decoder at all.**

**iOS (simulator, iOS 26.5)** — the same stream AVFoundation had rejected with `MediaError code 4`:

```
Build Succeeded · 0 error(s)
Playing: frames rendering, playback advanced from disclaimer → credits
onESAdded → same MediaTracks payload
Tapped the Hindi track → "select audio id=1", chip active, playback continued
```

**Audio-track enumeration and runtime selection both work, on both platforms.** Custom headers were
supplied via `options=['--http-referrer=…','--http-user-agent=…','--network-caching=3000']` and accepted.

**Measured size** (not the misleading xcframework figure): with MobileVLCKit linked into the app bundle,
`MobileVLCKit.framework` is **35 MB**; the whole debug app is 79 MB (Hermes 6.4 MB + RN + assets). The
525 MB / 577 MB xcframework figures are the unstripped multi-arch static archives and are *not* what ships.

**The build blocker and its fix.** The first attempts failed with `fmt/format-inl.h`: *"call to consteval
function … is not a constant expression"* (fmt 11.0.2 under Xcode 26.6 / Apple clang 17). **A control build
with the VLC package removed failed identically**, so it is environmental, not VLC. `-DFMT_USE_CONSTEVAL=0`
does **not** work because `fmt/base.h` defines `FMT_USE_CONSTEVAL` unconditionally rather than behind
`#ifndef`. The fix is a Podfile `post_install` hook that rewrites the header:

```ruby
fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
if File.exist?(fmt_base)
  src = File.read(fmt_base)
  patched = src.gsub("#  define FMT_USE_CONSTEVAL 1", "#  define FMT_USE_CONSTEVAL 0")
  File.write(fmt_base, patched) if patched != src
end
```

With that in place the iOS build succeeds with 0 errors. **Bearoom will need this hook too** — its current
iOS build predates the problem, so a clean rebuild (which adding any native module forces) would hit it.

**Remaining costs:**
- **Licence.** MobileVLCKit is **LGPL v2.1** (the wrapper is MIT). Distributable in a closed app when
  dynamically linked / relinkable, but it is a legal review item, not a footnote.
- **35 MB** of app size.
- Version pinning: `expo-libvlc-player@3.4.25` is the RN 0.79 line. Moving to 4.x+ requires RN 0.83+,
  57.x requires SDK 57 / RN 0.86 — so an Expo upgrade later means a coordinated player upgrade.

### 7.1d SANDBOX SPIKE — measured on the real Android device (2026-08-29)

Both candidates were built into the throwaway app and run against **the real obfuscated videasy plugin**
and identical synthetic workloads, on the A063.

| | **QuickJS asm.js in Hermes** | **hidden WebView (V8/JSC)** |
|---|---|---|
| native code needed | none (pure JS, ~2 MB bundle) | none — `react-native-webview` already a dep |
| boot | 305 ms | ~instant ("sandbox ready") |
| ES support | **10/10** (arrow, template, spread, regex, async, TypedArray, `replaceAll`, `fromEntries`, optional chaining, BigInt) | full V8 / JSC |
| 2M-iteration loop | 26 974 ms | **17 ms** |
| 20k objects + `JSON.stringify` | 5 178 ms | **9 ms** |
| regex over ~300 KB HTML | 2 499 ms | **3 ms** |
| parse+eval the 23 KB obfuscated plugin | 3 518 ms | **11 ms** |
| full `getStreams("550")` over real network | not viable | **12 352 ms → 6 streams, same URLs as Node/Hermes** ✓ |
| kill an infinite loop | ✅ `setInterruptHandler` — killed at 1 499 ms, `InternalError: interrupted` | ⚠️ hangs only the WebView; recover by reloading it. No CPU limit. |
| memory limit | `setMemoryLimit` API exists (**not verified** — the tap never landed) | ❌ none beyond OS process limits |
| isolation | separate realm; host globals unreachable | **separate OS process** (Android renderer / WKWebView content process) |
| 1 MB `postMessage` | n/a | **999 999 bytes delivered**, 9 ms to build |

**QuickJS-as-asm.js is a dead end: 300–1 600× slower than the WebView.** Parsing *one* plugin costs 3.5 s;
ten providers in parallel would block the JS thread for ~35 s. Its language coverage is perfect and its
interrupt handler genuinely works, but the throughput is disqualifying. (A *native* QuickJS module would be
fast — but the only RN binding is a 3-star, 7-commit module with no resource limits, and it would be a
second native dependency on top of VLC.)

**The WebView sandbox is the answer.** It runs plugins at full JIT speed, returns byte-identical results,
survives 1 MB messages (my stated biggest risk — it isn't one), gives real OS-process isolation, and needs
no new dependency. The fetch proxy worked transparently: 13 upstream calls were relayed with correct
statuses (200/404/500) and the plugin never knew.

**Hardening required before shipping** (measured gaps, from the `probe globals` run —
`{"ReactNativeWebView":"object","XMLHttpRequest":"function","localStorage":"throws","indexedDB":"object","WebSocket":"function","Worker":"function"}`):

1. **Capture `window.ReactNativeWebView` into a closure and `delete` it** after installing the shim —
   otherwise a hostile plugin can post arbitrary messages to the host bridge.
2. **Add `<meta http-equiv="Content-Security-Policy" content="default-src 'none'">`** to kill direct
   `XMLHttpRequest` / `WebSocket` / `Worker` / `fetch` egress, forcing everything through the proxy where
   we can allow-list hosts.
3. `domStorageEnabled={false}` already blocks `localStorage` (verified: "throws"); `indexedDB` still
   resolves — CSP plus an incognito/`about:blank` origin closes it.
4. **Host-side per-plugin timeout** — plugins carry none (§6.5.6); Nuvio uses 60 s.
5. **Reload-on-hang**, since there is no CPU interrupt. One WebView per run, or a small pool.
6. **iOS**: watch for WKWebView content-process kills under the memory pressure video playback creates
   ([expo/expo#46374](https://github.com/expo/expo/issues/46374)) — needs reload/retry.

### 7.2 Everything else adoption needs

1. **A fetch bridge** mirroring `__native_fetch`: arbitrary headers, **explicit redirect control**, and
   response headers surfaced. Required for 3/61 scrapers today (§4.3) and for parity in general.
2. **cheerio + crypto-js shims** — pure JS, work as-is; needed by 12 and 5 scrapers.
3. **A native player with header support** — `expo-video` (`VideoSource.headers`, Android + iOS), re-added.
4. **Repo curation + pinning**, given §6.

---

## 8. Reproducing

```bash
# harness deps
npm install cheerio crypto-js

# one scraper
node runner.js providers/videasy.js 550 movie
node runner.js providers/videasy.js 1396 tv 1 1        # season, episode

# playability (note the permissive HLS flags)
ffprobe -headers $'Referer: https://www.vidking.net/\r\n' \
        -allowed_extensions ALL -extension_picky 0 "<url>"

# cross-IP
brew install tor && tor --SocksPort 9050 &
curl --socks5-hostname 127.0.0.1:9050 -r 0-2000000 -o /dev/null -w '%{http_code} %{size_download}\n' "<url>"
```

In-app: point the dev client at Metro
(`xcrun simctl openurl <udid> "bearoom://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082"`),
then run the plugin through the debugger with `new Function("module","exports","console","fetch", code)`.
No app changes required.

---

## 9. Decision record (2026-08-31)

This study was commissioned as "is Nuvio's approach usable for us." It is, with conditions. What follows is
what was **decided**, so a future reader does not have to re-derive it from the measurements above.

### Adopted
- **Hybrid, plugin-first, additive.** The WebView hijack **stays** as a fallback lane; the plugin lane is
  added beside it. Removing the hijack buys nothing and would cost the working party feature.
- **Plugin lane becomes Program 1 · P3** on the roadmap (board `Phase 11`), *after* P1 (queue spine) and P2
  (native player lane). P1 first because the plugin lane produces a stream URL and something has to hold it;
  building P3 first would mean building the player interface and reworking party sync twice.
- **Sandbox: hidden WebView + native fetch proxy.** Chosen on measurement (§7.1d), not preference — it beats
  QuickJS-as-asm.js by 300–1600×. Note this WebView renders no video; it executes scraper JS only.
- **Provider set: `evyrith` + `playimdb` + `vidrock`**, pinned. See
  [`../providers/plugin-provider-shortlist.md`](../providers/plugin-provider-shortlist.md).
- **A source discriminator lands in P1's queue schema now** (`tmdb | direct | plugin | youtube`), even though
  only `tmdb` is implemented, so the wire format never has to change.

### Rejected, and why
- **QuickJS compiled to asm.js** (`@jitl/quickjs-asmjs-mjs-release-sync`) — perfect ES coverage and a working
  `setInterruptHandler`, but parsing *one* 23 KB plugin costs 3 518 ms vs 11 ms in a WebView. Ten providers
  in parallel would block the JS thread for ~35 s. Disqualified on throughput alone.
- **A native QuickJS module** — the only RN binding is a 3-star, 7-commit module with no memory limit and no
  interrupt handler. Not a dependency to put under playback.
- **Hermes `eval` / `new Function` for shipping** — works today (verified), but shares the app's realm,
  globals and intrinsics. Fine for measurement, never for third-party code.
- **On-device FFmpeg remux as the primary iOS path** — proven to work and cheap in CPU (§6.5.3d), but it
  needs a local HTTP server, a progressive-remux pipeline and seek-mapping, on top of an orphaned dependency
  (`arthenica/ffmpeg-kit` archived 2026-07-02, no canonical RN successor). Kept as a documented fallback.

### Deferred
- **`expo-libvlc-player@3.4.25`** → roadmap *Optional*. Runtime-verified on both platforms, but the Hindi
  **dubs** are HLS/AAC and play on plain `expo-video`; libVLC only unlocks the 4K HEVC + E-AC3 MKV tier.
  Revisit when that tier is shown to matter, and budget **35 MB** plus an LGPL-2.1 review.

### Non-negotiable conditions if P3 is built
1. **Pin providers to commit SHAs, never `refs/heads/main`.** These are obfuscated third-party scripts that
   auto-refresh on a timer; an unpinned repo is an unreviewed code push straight into the app.
2. **Allowlist only the measured set.** 111 of 152 audited scrapers returned nothing, and two
   (`anikototv`, `animekai`) return confidently *wrong* content — a 13-minute clip for every title, in one
   case. Curation is the product.
3. **Harden the sandbox before it executes untrusted code**: capture and `delete window.ReactNativeWebView`
   after installing the shim; CSP `default-src 'none'`; a host-side per-plugin timeout (plugins carry none);
   reload-on-hang.
4. **Resolve → open → read tracks → offer the picker.** Never promise the user a language before the player
   has reported the real audio tracks; manifest tags are inconsistent and provider labels are free text.

### Explicitly unchanged
Legal/ToS posture. Nothing here alters it; that is a product decision, not a technical one.

### Known unknowns carried forward
Long-run provider durability (this is one afternoon of measurement, and `videasy`'s upstream died for
~30 minutes inside that window); whether the sandbox holds up under 10 concurrent plugins on a low-end
device; and the real App Store implications of an LGPL native dependency, should P5 ever be taken.

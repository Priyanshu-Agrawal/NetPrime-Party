# Streaming Integration Research

> Internal reference compiled 2026-08-15 from a deep dive into three sources the
> team flagged: **p-stream** (`xp-technologies-dev/p-stream`), the **rentry "API
> Sites"** list (`rentry.co/onbksdgu`), and **CoorenLabs** (`coorenlabs.com`).
>
> ⚠️ **Legal / ToS caveat (applies to almost everything below).** The concrete
> *providers* named here are unlicensed streaming aggregators / embed hosts /
> scrapers that serve copyrighted movies, TV and anime without authorization.
> Their domains rotate constantly (a piracy-operation tell). Shipping the
> provider **list** or a header-spoofing proxy in a store app carries real
> DMCA / app-store-rejection risk. **Reuse the architecture and techniques, not
> the target list.** This doc is decision-support for our own player, not an
> endorsement of any specific source.
>
> 🗒️ **STATUS UPDATE (post-cleanup).** This doc predates the decision to drop
> on-device extraction. `@movie-web/providers` has since been **uninstalled** and
> `resolveNativeStream` **removed** — its scrapers resolved nothing. The native
> player now resolves streams by **sniffing the provider's own web player** in a
> hidden WebView (see [../architecture/native-player.md](../architecture/native-player.md)).
> Read the sections below as background/history, not the current plan. The
> `@p-stream/providers` fork remains the reference if we ever revisit extraction.

---

## TL;DR — what's actually worth taking

1. **Our native-extraction approach is already the right one.** `utils/streamResolver.ts`
   uses `@movie-web/providers` with `targets.NATIVE`, `consistentIpForRequests: true`,
   `proxyStreams: false`. p-stream (a maintained movie-web fork) confirms this is
   exactly how you resolve a title → direct `.m3u8`/`.mp4` on native, where RN's
   `fetch` has no CORS wall and the player (ExoPlayer/AVPlayer via expo-video)
   can set request headers itself — **often no proxy needed at all**.
2. **The single biggest reliability win to port next:** p-stream's **provider
   fallback / ranking + per-media failure memory** (see §2). We currently take the
   first source `runAll` returns; they rank sources, remember which failed per
   title, honor a minimum-resolution gate, and resume scraping after a failure.
3. **Reusable playback infra:** an **M3U8 proxy** only *when a stream carries
   headers / lacks CORS_ALLOWED* (CoorenLabs ToonStream + movie-web `m3u8-proxy`
   both implement the same pattern), **intro/credit-skip** timing APIs, and
   **external-subtitle** scraping (Wyzie) — all optional add-ons.
4. **Watch-party:** ours (Supabase authority + Realtime) is already more robust
   than p-stream's HTTP-polling model; nothing to port, but their drift-correction
   constants are a sanity check (drift threshold ~5s, host-time prediction).

---

## 1. p-stream (`xp-technologies-dev/p-stream`, branch `production`)

A Vite + React 18 SPA, maintained fork in the movie-web / sudo-flix lineage. Its
scraper package is **`@p-stream/providers`** (a hard fork of `@movie-web/providers`
— we use the upstream npm package). Architecture (`src/ARCHITECTURE.md`) is layered
data → state → UI: `src/backend/` (React-free data layer), `src/stores/` (Zustand),
`src/components/player/` (framework-agnostic display), `src/pages/`.

### Provider wiring (`src/backend/providers/providers.ts`)
`makeProviders({ fetcher, proxiedFetcher, target })` picks the target at runtime:

| Environment | target | proxiedFetcher |
|---|---|---|
| Desktop app | `targets.NATIVE` | extension fetcher |
| Browser extension | `targets.BROWSER_EXTENSION` | extension fetcher |
| Plain browser | `targets.BROWSER` | load-balanced simple-proxy |

**We are the "native" case** → `targets.NATIVE` (already in `streamResolver.ts`).

### Two-stage scrape model (inherited from movie-web)
- **Sources** (`Sourcerer`): `ScrapeMedia` → either a stream, or a `discoverEmbeds`
  event yielding `{ embedId, url }`.
- **Embeds** (`Embed`): one embed URL → the actual `m3u8`/`mp4` + headers.
- Orchestration: `providers.runAll({ media, sourceOrder, embedOrder, events })`.
  Events (`init`, `start`, `update`, `discoverEmbeds`) drive live "trying source X…" UI.

### 2. Fallback / ranking — **the part to port** (`src/hooks/useProviderScrape.tsx`, `src/stores/player/slices/source.ts`)
- Static numeric **`rank`** per scraper (higher tried first) + **flag/feature
  filtering** by target (`flagsAllowedInFeatures`).
- User-tunable `sourceOrder` / `embedOrder` + "prioritize last successful source".
- **`preferredMinimumResolution` gate**: keep scraping until a source meets a min
  resolution, tracking a `bestFallbackOutput` to fall back to.
- **Per-media failure memory**: `failedSourcesPerMedia` / `failedEmbedsPerMedia`
  keyed by `getMediaKey` (`movie-<tmdbId>` / `show-<tmdbId>-<seasonTmdbId>-<episodeTmdbId>`).
  Failed IDs are filtered from subsequent runs; `resumeScraping(media, startFromSourceId)`
  restarts *after* a given source.

  → **Action for us:** wrap `resolveNativeStream` so it iterates sources by rank,
  records failures per media key (MMKV), and retries the next source instead of
  giving up on the first null. Big perceived-reliability win.

### 3. Proxying (only sometimes needed)
`requiresProxy(stream)` is true only when the stream **lacks `CORS_ALLOWED` or
carries headers**. Then `setupProxy(stream)` base64url-encodes `{type,url,headers}`
and rewrites the playlist to `<proxy>?payload=…`. On **native we mostly skip this**
because expo-video/ExoPlayer set headers directly; keep an optional m3u8 proxy for
the residual header-locked CDNs (see CoorenLabs ToonStream proxy, §3, for a concrete
implementation to mirror if we self-host one).

### 4. Player
Framework-agnostic `DisplayInterface` over a raw `<video>` (`display/base.ts`),
event bus (`play/time/qualities/error/…`), state in Zustand. HLS via `hls.js`
with a custom `ArtemisRetryLoader` that detects "403/forbidden" HTML returned in
place of a playlist and retries with backoff. DASH via `dashjs` with per-request
header injection. Quality model `unknown|360|480|720|1080|4k` (**4k intentionally
deprioritized below 1080 in auto-select** — matches our `QUALITY_ORDER`). Rich
subtitle pipeline (external scraping, TTML, on-device translate, even Whisper/VAD
audio sync — deep but optional).

→ For us: swap the display layer for `expo-video`, keep the event-bus abstraction
and the retry-on-403 idea for HLS.

### 5. TMDB (`src/backend/metadata/tmdb.ts`)
Bearer v4 token, secondary base fallback, **optional** proxying (user pref), a
`SimpleCache`, and a **6-request concurrency limiter** to avoid 429s. We already
proxy TMDB via `tmdb-proxy-worker.js`; the **concurrency limiter + cache** are
worth adopting.

### 6. Watch-party (they poll; we don't need it)
6-char crypto room codes (ambiguity-free alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
— same idea as our `utils/roomCode.ts`), HTTP status POST (host 1.5s / guest 3s),
GET poll every 2s with host-time prediction and `DRIFT_THRESHOLD_SECONDS = 5`.
Ours (Postgres authority + Realtime broadcast + lease) is strictly better — no action.

---

## 2. rentry "API Sites" (`rentry.co/onbksdgu`)

A community link directory: ~65 **iframe-embed** source providers (TMDB/IMDB-ID
driven, mostly keyless) + a few JSON APIs + 2 self-hosted scrapers + utilities.
Domains are volatile. **Do not hardcode this list.** Categories worth knowing:

- **Self-hosted scrapers (open source, run them yourself):**
  **P-Stream** (`github.com/xp-technologies-dev/p-stream`) and **nano** (`github.com/mohameodo/nano`).
- **Utilities (the genuinely useful, less-legally-fraught bits):**
  - **Wyzie Subs** — subtitle scraping API, npm `wyzie-lib`, docs `docs.wyzie.ru`.
  - **TheIntroDB** (`theintrodb.org`, GitHub) and **SkipDB** (`skipdb.tv`) —
    intro / credit **skip-timing** JSON. Great "Skip Intro" UX add.
- **JSON-API (vs iframe-only) providers**, if we ever evaluate sources: Movish
  (`api.movish.net/docs`), Xyra/StreamHub (`api.xyra.stream`), Vyla (Mintlify docs),
  plus the many `Vid*` embed players (WebView-embed, ID-driven).

The bulk are **iframe embeds** — i.e. the WebView-hijack path we already have in
`HijackPlayer` (embed the page, drive the `<video>`). The **`@movie-web/providers`
native-extraction path is preferable** where a scraper exists for the source.

---

## 3. CoorenLabs (`coorenlabs.com` / `github.com/CoorenLabs/Cooren`)

An **open-source, self-hosted** unified scraper API (Bun + Elysia + Cheerio + Zod +
Redis cache + OpenAPI). Not a hosted SaaS — you clone and run it. **No built-in
auth** (docs tell you to add your own). Route groups `/anime`, `/manga`, `/movie-tv`,
`/music`.

- **`/movie-tv`** providers: **PrimeSrc** (source extractor keyed by TMDB id →
  hosts `PrimeVid`, `Streamtape`, `Dood`; `GET /movie-tv/primesrc/movie/:tmdbid`,
  `…/tv/:tmdbid/:season/:episode`; cache hit 3h / miss 10min) and **Yflix**
  (catalog/search for discovery: `/home`, `/search?query=&type=movie|tv`).
  Note **PrimeSrc == the `primesrc.me` entry on the rentry list** (same upstream).
- **Reusable blueprint — the ToonStream media-proxy** (under `/anime/toonstream/`):
  `m3u8-proxy?url=&headers=` (HLS playlist rewrite), `ts-segment?url=`,
  `mp4-proxy?url=` (range-aware seeking), `fetch?url=` (keys/captions/images), with
  size caps (m3u8 5MB / ts 50MB / mp4 20GB → 413). Requires `SERVER_ORIGIN`; sources
  return `proxiedUrl` fields. **This is the concrete m3u8-proxy design to mirror if
  we ever self-host a proxy for header-locked CDNs** (§1.3).
- GitBook trick for deeper digging: append `.md` to any docs page; ask questions via
  `?ask=<q>&goal=<g>`; machine index at `docs.coorenlabs.com/llms.txt`.

---

## Recommended next steps (prioritized, for our app)

1. **Provider fallback + per-media failure memory** around `resolveNativeStream`
   (port p-stream's algorithm; store failures in MMKV keyed by media key). *High
   reliability ROI.*
2. **TMDB concurrency limiter + in-memory cache** (adopt p-stream's 6-request
   limiter) to avoid 429s.
3. **"Skip Intro/Recap"** via TheIntroDB/SkipDB timing (nice UX, low risk).
4. **External subtitles** via Wyzie (`wyzie-lib`) for the native player.
5. **Optional self-hosted m3u8 proxy** (mirror CoorenLabs ToonStream / movie-web
   `m3u8-proxy`) *only* for streams that carry headers / lack CORS_ALLOWED.
6. Keep the WebView-hijack path (`HijackPlayer` + `PlayerControls`) as the fallback
   for sources without a native scraper.

_All provider names above are references for evaluation only; see the legal caveat
at the top before integrating any specific source into a shipped build._

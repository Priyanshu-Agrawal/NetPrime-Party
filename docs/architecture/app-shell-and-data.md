# App Shell, Navigation, Data & Storage

> The scaffolding around the players: **expo-router navigation**, the **root
> provider stack**, **TMDB data** (via a Cloudflare Worker proxy), **local MMKV
> storage**, **theming**, the **Supabase client**, and **dev tooling**. Verified
> against current code. Read [README.md](./README.md) for the map and
> [player-and-injection.md](./player-and-injection.md) / [watch-party-sync.md](./watch-party-sync.md)
> for the two subsystems this shell hosts.

## Navigation (expo-router, file-based)
```
app/_layout.tsx            Root Stack (headerless). Mounts the provider stack + AlertHost.
├─ (tabs)/_layout.tsx      Bottom Tabs w/ custom FloatingTabBar. initial=index.
│   ├─ index.tsx           HOME — hero carousel, party CTA, Continue Watching, rails
│   ├─ search.tsx          SEARCH — TMDB search, provider/mood filters, poster grid
│   └─ more.tsx            PROFILE — name edit, local-history stats, settings rows
├─ (player)/_layout.tsx    Stack (headerless), forces black system bg for playback
│   ├─ details.tsx         MOVIE details (fetchDetails("movie", id))
│   ├─ tvDetails.tsx       TV details (fetchDetails("tv", id))
│   └─ player.tsx          SOLO player — plain WebView + provider sheet (NO bridge)
├─ party.tsx               WATCH PARTY — one player + Supabase-authority sync + chat
├─ joinParty.tsx           JOIN — 6-char room-code entry (valid ≥4)
├─ onboarding.tsx          FIRST-LAUNCH — 3-slide, sets name + setOnboarded()
├─ myList.tsx              MY LIST — watchlist poster grid (MMKV), long-press remove
├─ watchHistory.tsx        re-export of components/watchHistory.tsx
└─ trendingShows.tsx       TRENDING TV — paginated FlatList from movieContext
```
- Root `_layout` sets `unstable_settings = { initialRouteName: "index" }` and renders
  a single headerless `<Stack>` — every group/screen auto-registers. `(tabs)` uses
  `<Tabs tabBar={FloatingTabBar} …>`; tabs are `index`/`search`/`more`.
- **Home gates onboarding**: `index.tsx` `Redirect`s to `/onboarding` when
  `!hasOnboarded()`.
- (A `sync-demo` route with two `VidLinkPlayer`s over an in-memory `mockTransport`,
  which exercised the old `services/sync/*` engine, was **removed** — superseded by the
  Supabase-authority party. See [watch-party-sync.md](./watch-party-sync.md).)

## Root provider stack (`app/_layout.tsx`)
Wrap order (outer → inner):
```
GestureHandlerRootView            (flex:1)
└─ BottomSheetModalProvider       (@gorhom/bottom-sheet)
   └─ MovieContextProvider        (TMDB — see below)
      ├─ StatusBar
      ├─ <Stack …/>               (all routes)
      └─ <AlertHost/>             (components/ui/BearAlert — global bear-styled alerts)
```
**Init side-effects (order matters):**
- **`import "../devtools/execbro"` is line 1** — must stay first so dev capture starts
  before any module fetches (see [Dev tooling](#dev-tooling)).
- `import "react-native-get-random-values"` + `import "react-native-url-polyfill/auto"`
  — the two early polyfills the app genuinely needs (crypto for uuid; global URL for
  supabase realtime), inlined here. (The old `utils/polyfills.ts`, which existed only
  for the now-removed `@movie-web/providers`, was deleted.)
- `Appearance.setColorScheme("dark")` at module scope — **forces dark app-wide**,
  ignoring device setting. (The legacy `contexts/colorContext/*` + `constants/Colors`
  are unused relative to `theme/bearoom`.)
- Fonts via `useFonts` (Outfit 600/700/800, Inter 400/500/600); `if (!fontsLoaded)
  return null` — this gates first render **instead of** `expo-splash-screen` (there is
  no splash management).
- ⚠ **No `SafeAreaProvider` at root** — screens call `useSafeAreaInsets()` on RN's
  default provider. ⚠ `SystemUI.setBackgroundColorAsync(colors.bg)` runs in the render
  body (fires every render), not in an effect.

## TMDB data (`contexts/movieContext/movieContext.tsx`)
> ### The Cloudflare Worker proxy (why it exists)
> TMDB's API host is RST/blocked on many Indian ISPs. So all TMDB traffic goes through
> a **Cloudflare Worker** — `API_URL = "https://tmdb.spiderfan-no1.workers.dev/"` — which
> reaches TMDB from Cloudflare's network and **injects the TMDB bearer token
> server-side** (Worker secret `TMDB_TOKEN`). **The token is NOT in the app.**
> `API_BEARER_TOKEN` is `""` (deprecated). `API_HEADERS` forces
> `Accept-Encoding: identity` + no-cache (required for the Worker — note this if you
> ever add compression/caching). The Worker source is `tmdb-proxy-worker.js`.

- The **context** only fetches two lists (no caching, plain `fetch` on mount):
  movies → `movie/now_playing`, series → `trending/tv/day`, both paginated with
  id-dedupe + `hasMore`. Exposes `movies`, `series`, `loading*`, page counters, and
  `fetchPopularMovies/Series(page?)`. `useMovieContext()` throws outside the provider.
- Richer catalog data comes from **helpers**, not the context:
  - **`utils/tmdbDetails.ts`** — one big `fetchDetails(type,id)` with
    `append_to_response` (credits/videos/images/recommendations/similar/reviews/
    keywords/external_ids/watch-providers, + TV aggregate credits/content_ratings).
    Extractors: `pickTrailer`, `pickCertification`, `topCast`, `keyCrew`,
    `pickProviders` (JustWatch, regions `IN,US,GB`), `externalLinks`, `keywords`,
    `money`, `runtimeStr`. Images via `img(path, size="w500")` →
    `image.tmdb.org/t/p/{size}{path}`.
  - **`utils/tmdbLists.ts`** — `fetchList(path)` for home rails/hero; `MediaItem`
    shape + helpers `itemType/itemTitle/itemYear/detailsRoute` (routes to
    `/(player)/details` or `/(player)/tvDetails`).

## Provider list — bundled, NOT remote
> 🐛 **Doc correction (verified):** The live provider catalog is **bundled locally** —
> `components/player/providerRegistry.ts` does `import providersData from
> "@/providers.json"` and builds `PROVIDERS` by merging each entry with the
> `HIJACK_CAPS` overlay. The remote **`GITHUB_RAW_JSON_URL` fetch
> (`streamResolver.listProviders`) had no live caller and was **REMOVED**.** (Earlier docs
> said "fetched from GitHub raw"; that was wrong.) See
> [../providers/README.md](../providers/README.md).

- `providers.json` = 14 entries (videasy, vidfast, vixsrc, vidlink, vidcore,
  111movies, vidnest, vidphantom, mycineby, + non-hijackable vidsrcTo, multiembed,
  vsembed.ru, vidsrccc2, vidsrcvip2). Each: `{ id, name, urls:{movie,tv}, allowedDomain }`.
- **`utils/streamResolver.old.ts` is renamed-old reference scaffolding** — the dead
  `resolveNativeStream` (`@movie-web/providers` NATIVE extractor) + `listProviders`/
  `GITHUB_RAW_JSON_URL` were **REMOVED** (package uninstalled); the reusable pure helpers
  (`buildEmbedUrl`/`embedOrigin`/`DEFAULT_SNIFF`) remain for the native-player POC,
  consumed only by the also-renamed `SnifferWebView.old` / `EmbedWebView.old`. All
  `*.old.*` files are **excluded from tsc + eslint**. Two `buildEmbedUrl`s exist — the
  live one is `providerRegistry.buildEmbedUrl(p, m, {party?})`; don't cross them.

## Local storage (MMKV)
> ⚠ **One shared instance.** Every module calls `createMMKV()` with **no id**, so
> `history.ts`, `watchlist.ts`, `prefs.ts`, and the Supabase auth adapter all share the
> **single default MMKV store**. Keys must stay globally unique (they are).

| Module | Keys | Shape / API |
|---|---|---|
| `utils/history.ts` | `watchHistory` (+ legacy JSON file, auto-migrated then unlinked) | `HistoryItem{id,title,type,season?,episode?,poster_path?,positionSec?,durationSec?,updatedAt?}`. Composite key `tv:id:s:e` else `type:id` (per-episode resume). `getWatchHistory`, `addToWatchHistory` (cap **200**), `updatePlaybackPosition` (throttle ~5s; last-5s → finished, reset 0), `getPlaybackPosition`, `clearWatchHistory`, `clearAppCache`. Async. |
| `utils/watchlist.ts` | `watchlist` | `WatchlistItem{id,type,title,poster_path?,addedAt}`, cap **300**. `getWatchlist`, `isInWatchlist`, `toggleWatchlist`→bool, `removeFromWatchlist`, `clearWatchlist`. Sync. |
| `utils/prefs.ts` | `app.onboarded`, `pref.autoplayNext`, `pref.dataSaver` | `hasOnboarded` (def false), `getAutoplayNext` (**def true**), `getDataSaver` (**def false**) + setters. Sync. |

## Theme (`theme/bearoom.ts`) — "cozy cinema-lounge"
- **Responsive primitives:** `BASE_WIDTH=411`, `RATIO=clamp(SCREEN_W/BASE_WIDTH,0.82,1.12)`,
  `scale(n)`, **`ms(n,factor=1)`** (the workhorse for fonts/paddings/fixed dims).
- **Palette (`colors`):** bg `#100D0A`, bgElevated `#16120D`; **honey `#F0A93C`**,
  honeyBright `#FFC661`, honeyDeep `#C9822A`, honeySoft/Glow (alpha); text `#F6EFE3`,
  textDim `#A79E90`, textFaint `#6E675D`; surface/border are low-alpha warm-white;
  danger `#E5736B`, onHoney `#1A1206`, scrim `rgba(16,13,10,0.72)`.
- `radius` (sm8…pill999), `spacing` (xs4…xxxl40), `font` (Outfit headlines / Inter
  body), `type` (display 32 … overline 11), `glow` (honey/soft shadows),
  `glass` `{intensity:24,tint:"dark"}`. Default export `theme`.

## Supabase client (`services/supabase.ts`)
- `createClient(URL, PUBLISHABLE_KEY, { auth:{ storage:MMKVAuthStorage,
  persistSession:true, autoRefreshToken:true, detectSessionInUrl:false },
  realtime:{ params:{ eventsPerSecond:20 } } })`. `AppState` drives
  `startAutoRefresh`/`stopAutoRefresh` (RN foreground-only).
- **Auth = anonymous, persisted.** `ensurePartyAuth()` (lazy, memoized) reuses the
  session `user.id` or `signInAnonymously()` — each install gets a **stable
  `auth.uid()`** (the RLS principal) that survives restarts. Both chat and party
  transports await this before subscribing.
- ⚠ **Committed in source (not env):** `SUPABASE_URL` (`kdcghbuknadvcmjctsqk`) +
  `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`). Publishable/anon keys are *designed*
  to ship in clients (RLS is the real guard), so this is safe — but note it's hardcoded,
  not `.env`. (Contrast: the **KLIPY** key and **TMDB** token are secrets and must never
  be committed — see [chat-and-reactions.md](./chat-and-reactions.md) and the Worker.)

## Dev tooling (`devtools/execbro.ts`)
- Entirely `if (__DEV__)`; uses `require("execbro-sdk")` (a **devDependency**;
  `require` not import so Metro dead-code-eliminates it in prod) → `init({
  maxNetworkEntries:500, maxConsoleEntries:500 })` in a try/catch that only warns.
- Patches `fetch` + `console` into an in-app ring buffer that the **ExecBro MCP**
  auto-detects — giving full request/response bodies (Supabase, TMDB, KLIPY) + startup
  logs on the New-Arch/Bridgeless runtime where CDP is only partial. Refs on
  `globalThis.__RN_AI_DEVTOOLS__`. **Imported first** in `_layout.tsx`.
- Complementary debugging: **Chrome DevTools over CDP via adb** for the WebView itself
  (see [player-and-injection.md](./player-and-injection.md)). execbro MCP has been flaky
  (disconnected last session) → CDP+adb is the reliable fallback.

## Secrets summary (what's committed vs. what must never be)
| Secret | Where | Committed? |
|---|---|---|
| Supabase URL + **publishable** key | `services/supabase.ts` (source) | ✅ safe (public by design) |
| TMDB bearer token | Cloudflare Worker secret `TMDB_TOKEN` | ❌ never in app |
| **KLIPY** `app_key` | `EXPO_PUBLIC_KLIPY_KEY` in gitignored `.env.local` + EAS secrets | ❌ never committed |

## Styling (Bearoom design system)

Dark-only app (`Appearance.setColorScheme("dark")` in `App.tsx`). All visual tokens live in **`theme/bearoom.ts`**; import via **`@/theme`** or **`@/theme/bearoom`**.

| Layer | Path | Role |
|---|---|---|
| Tokens | `theme/bearoom.ts` | Colors, spacing, radius, typography, glow, glass, chat |
| Style helpers | `theme/styles/*` | `textVariant()`, gradients, layout, surfaces, interaction |
| UI kit | `src/ui/*` | `Text`, `Box`, `Stack`, `Button`, `PosterCard`, `Screen`, … |
| Legacy re-exports | `components/ui/*` | Thin re-exports to `src/ui` for existing imports |

**Rules:** No inline `#hex` or `rgba()` outside `theme/`. Use `<Text variant="…" />`, `spacing.*`, `gradients.*`, and kit components in features. Run `npm run check:theme` in CI.

## Gotchas
- Dark is forced at module load; don't wire a light theme expecting `useColorScheme`.
- `SystemUI.setBackgroundColorAsync` in render bodies (root + player layout) — cosmetic,
  but not idiomatic.
- No SafeAreaProvider / no splash management (fonts gate first paint).
- `streamResolver.old` + `SnifferWebView.old` + `EmbedWebView.old` are **renamed-old,
  build-excluded** reference scaffolding — reusable for the native player, nothing calls
  them today. `@movie-web/providers` (+ `resolveNativeStream`, `utils/polyfills.ts`) and
  the whole `services/sync/*` cluster (+ `VidLinkPlayer`, `sync-demo`) were **deleted**.

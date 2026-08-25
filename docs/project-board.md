# NetPrime Master Implementation Plan

This document serves as the persistent, living checklist and documentation for the entire NetPrime project. It lives directly in the repository so it scales with the codebase and remains accessible to all developers and agents. 

As tasks are completed, they will be summarized and closed out step-by-step.

## Task Status Legend
- `[ ]` Pending
- `[/]` **ACTIVE**
- `[x]` Closed & Summarized

---

## `[x]` Phase 1: Architecture & Deep Research
**Status:** CLOSED
**Summary:** 
Conducted deep case studies on piracy architectures (iMayhem, CinePro, StreamGrabber). Rejected the $500/mo reverse-proxy approach. Locked in the **Two-Tier Hybrid OMSS Architecture**. 
* **Tier 1:** Serverless Edge API (Fast Path).
* **Tier 2:** React Native `SnifferWebView` (Heavy Tank). 
* Documented the "4 Hidden Walls of WebView Sniffing" that defeat standard scrapers.

## `[x]` Phase 2: Database Strategy & Seeding
**Status:** CLOSED
**Summary:**
Transitioned from hardcoded JSON to a dynamic Supabase Postgres backend. 
* Scraped the `LyeDevGit` repository and filtered out 15+ hostile/dead providers.
* Seeded the **Top 10 Providers** into the `providers` table.
* **Strategic Pivot:** Forced `videasy` (NetPrime) to Priority 1 to guarantee multi-dub (Hindi) support for the target Indian demographic, with fast English endpoints (VidSrc) serving as indestructible fallbacks.

## `[x]` Phase 3: Tier-1 Edge Server (Cloudflare Worker)
**Status:** CLOSED
**Summary:**
Built and deployed the Cloudflare Worker to `netprime-worker.spiderfan-no1.workers.dev`.
* Completely overhauled with **Hono** and **Zod**.
* Features self-documenting Swagger UI (`/docs`).
* Automatically fetches provider config from Supabase, caches it for 60s at the Edge, and aggregates scrape results across all enabled providers.

---

## `[x]` Phase 4: React Native App Bootstrapping
**Status:** CLOSED
**Summary:**
Implemented modern Redux Toolkit (RTK) global state architecture.
* Defined strict type interfaces for Player, Watch Party, and Providers.
* Created modular feature slices using `extraReducers` to intercept API responses.
* Built the `workerApi` using RTK Query with Edge-Caching synchronization, and instantiated a headless `ConfigBootstrap` component inside `App.tsx` to automatically pull and hydrate `providersSlice` on launch.

---

## `[x]` Phase 5: The Pre-Play UI (Zero-Wait UX)
**Status:** CLOSED
**Summary:**
Locked in the UX for title details to maximize speed and remove redundancy.
* **Zero-Wait Direct Load:** The `[▶ Play]` button instantly mounts the `SnifferWebView` for Priority 1 (NetPrime) without wasting a network trip on `/scrape`.
* **Mechanical Domain Sync:** Established a `supabase db dump --data-only` routine to keep local seed domains perfectly synced with production, avoiding domain rot.
* **UI Split:** Moved the manual `[⚙️ Sources]` selection into the Player screen (or as a secondary override), relying on auto-routing for the primary flow.

---

## `[x]` Phase 5.5: User Preferences (Silent Memory & Matching)
**Status:** CLOSED
**Summary:** 
Implemented a perfectly silent, zero-UI preference memory system.
* **Lean Architecture:** Hooked directly into `utils/prefs.ts` (MMKV). No Redux overhead for local scalars.
* **Fuzzy Matcher:** Built `utils/trackMatch.ts` to seamlessly handle provider label variances (e.g., resolving "Fade" or "hin" to Hindi). Successfully bypassed the Levenshtein distance trap for short ISO codes.
* **Auto-Apply:** `PlayerScreen` quietly intercepts `onEvent` track loads and applies the user's saved preferences on the fly without causing re-buffers.

---

## `[/]` Phase 6: Cloudflare-Served Injection Scripts (The Bridge)
**Status:** **ACTIVE** — cutover code complete + typecheck clean; PENDING device QA.
**Objective:** Decouple DOM-hijack logic from the app binary for instant cat-and-mouse updates.

**Strategy pivot — Option 1 (serve the PROVEN bridge verbatim).** A red-team of the
legacy `BRIDGE_JS` found it does **8 subsystems** the clean `universal-core` skeleton
lacks (watch-party echo-suppression, background `keepAlive`, lock-screen `__soloCmd`,
guest `__vlSetGuest`, `nativeControls`, iframe-walking finder, fullscreen, videasy
control-bar CSS fix). Rewriting execution logic *while* changing deployment architecture
would have silently regressed party sync + background audio. So we ship the existing
`BRIDGE_JS` **byte-for-byte** over-the-air today (ZERO behaviour change, only delivery
moves), and keep the clean core+delta as a **later, incremental refactor**.

**Details:**
* `[x]` **Worker:** lean `/config` (`script_version` only — bodies never sent here) +
  new `GET /scripts` (heavy bodies, own edge cache); `/cache/purge` clears both.
* `[x]` **Validation Gate:** `scripts/upload-bridge.ts` — concat → strict `new Function()`
  smoke-test → content-hash version → service-role PATCH → purge. A bad script can't ship.
* `[x]` **Legacy bridge extracted:** `src/scripts/legacy-videasy.ts` = `BRIDGE_JS` verbatim
  (not bundled — only the CLI reads it). CLI serves it as `videasy@<hash>`.
* `[x]` **App cutover:** `src/scripts/bridgeCache.ts` (MMKV boot-diff vs `/config`
  `script_version`, fetch `/scripts` only when changed); `ConfigBootstrap` triggers the
  sync; `HijackPlayer` injects `getCachedScript(providerId)`; `BRIDGE_JS` deleted from the
  binary; `scriptVersion` plumbed → Phase-7 telemetry field lit.
* `[x]` **Future baseline kept:** `universal-core.ts` + `videasy.delta.ts` remain in-repo
  as the clean-refactor target. The deferred **event-rename** (`timeupdate`/`state`) and
  **echo-suppression into `np.cmd`** belong to THAT refactor — not needed for Option 1
  (the legacy bridge already has them).
* `[ ]` **Device QA:** re-upload the legacy bridge first, then verify none of the 8
  subsystems regressed. See `docs/qa/phase6-cutover-qa.md`.

---

## `[/]` Phase 7: Telemetry & Failure Memory (The Smart Net)
**Status:** **ACTIVE**
**Objective:** Prevent endless fallback loops and power the cat-and-mouse update cycle.
**Details:**
* `[x]` Implement a tiny `POST /report` (provider, tmdbId, outcome) to Supabase.
* `[x]` Server-side: Auto-deprioritize or disable dead providers based on failure rates (aggregation view built, rate-limiter applied).
* `[x]` Client-side: Wire the RTK Query `reportOutcome` mutation.
* `[x]` Client-side: Maintain a session exclusion list so the fallback UI never loops through already-dead providers.

---

## `[x]` Phase 8: Lazy Fallback & The Safety Net
**Status:** **COMPLETED** (Pending Device QA)
**Objective:** Create a resource-efficient, zero-wait fallback system if the primary provider fails.
**Details:**
* **Lazy Fetch:** `[▶ Play]` instantly mounts Priority 1. Fallback scrape triggers only if the primary fails or user taps `[⚙️ Sources]`.
* **Filtered Hard Error:** WebView throws `onError`/`onHttpError` (filtered to `isForMainFrame`) or `onRenderProcessGone`. Auto-pops `ProviderSheet`.
* **Smart Timeouts:**
  * *10s Soft (No-Bind):* Shows actionable banner ("Taking too long?").
  * *25s Hard Timeout:* Gated on passive play-intent gesture to prevent false-firing on idle ad-walls.
  * *Stall Detector:* Reports `playback_stall` overriding the `success` lock if video dies mid-stream.
*(Note: `captcha_block` and `not_found` telemetry triggers remain blocked until Phase 6 bridge completion).*
* **Wire Phase 7 failure reports:** at each detection point (`onFatalError`, the no-bind timer, the stall detector) call `report("<outcome>", …)`. Give `playback_stall` its own guard so it can fire even after a `success`.
* **Session exclusion list:** track already-failed providers so the fallback never re-offers a corpse; read `provider_health` to order the alternatives.

---

## `[x]` Resilience & Error-Recovery batch (post-Phase-8, 2026-08-20/21)
**Status:** SHIPPED (`ec99342` + `2699517`, branch `feat/improvements`). Worker redeployed. Device QA pending → `docs/qa/error-recovery-qa.md`.
**Summary:** Cashed in the built telemetry + hardened the failure path.
* **Party-capability gate:** `isPartyCapable = hijackable && scriptVersion` — the 🐾 badge / Watch-Party / `defaultHijackProvider` / hint show party ONLY where a script is served (videasy), ending the "badge lies" gap.
* **Health-aware ordering:** worker `/config` demotes chronically-failing providers (`failure_rate ≥ 0.5 && ≥ 3 distinct clients`) below healthy ones (never auto-disables); the client mapper stops re-sorting so the server owns order. Deployed; dormant until telemetry accumulates.
* **Per-title failure memory:** `utils/failureMemory.ts` (MMKV, 4h TTL) biases the default source away from a provider that recently failed for that title.
* **Autoplay-next:** `getAutoplayNext()` (default on) gates videasy's next-episode URL params.
* **Error recovery:** HijackPlayer branded error overlay (Retry / Try another source) + dependency-free auto-retry (5/10/15s, cap 3, remount-nonce) + recoverable exclusions (recently-failed providers dimmed-but-pickable). Hardened via **2 adversarial review rounds (10 bugs fixed)**. Resolves the Phase-8 QA **F3** (unbranded error page / no auto-reload / excluded-until-remount).
* **Earlier this session (`8fbd13b`):** resume-seek on switch, gesture-gated no-bind banner, hardware-back-exits-fullscreen, fallback-sheet dismiss-race, + a `patch-package` fix for @gorhom/bottom-sheet's rotation redbox.

---

## `[x]` Player-UI polish batch (2026-08-21)
**Status:** COMMITTED on `feat/improvements` (batch in `4bfb5c0` — note that commit is mislabeled "refactor(api)…" from an amend collision; the revert of the first-frame gate is `0c5a0d3`; the rotation/chrome/banner work is `e783682`). `tsc` clean, device-verified. Files: `HijackPlayer.tsx`, `ProviderSheet.tsx`, `src/screens/PlayerScreen.tsx`, `PlayerSettingsSheet.tsx`, `src/ui/BearAlert.tsx`. ⚠️ The **first-frame / `playerReady` gate described below was REVERTED** (it masked the whole player on iOS when the first-frame signal didn't latch) — see the "Rotation + provider-chrome polish" and "Branded loading cover gates on BIND" entries further down for the shipped behavior.
* **Professional branded loading screen (`HijackPlayer`):** blurred title-poster backdrop (expo-image STATIC `blurRadius:25` — a Glide/CoreImage transform, NOT a live backdrop capture, so it's safe over the player + unmounts before playback → never touches the stutter rule) + vertical gradient scrim + crisp poster thumbnail (rounded, honey-glow hairline, NO shadow/elevation) with a honey spinner glazed over it + 🐾 "Loading {provider.name}" / "Getting your stream ready…". Falls back to a paw badge when no poster. Replaced the bare black "Loading NetPrime…". `posterUrl` plumbed from `PlayerScreen` (`artworkUrl`). Device-confirmed.
* **Loading screen was half-height → FIXED.** `react-native-webview` renders its loading view as a normal **flex sibling** of the native WebView inside a `flex:1` column container; a `flex:1` loader split the space **50/50**. Fix: the cover uses `StyleSheet.absoluteFillObject` (overlay). (`startInLoadingState`/`renderLoading` dropped in favor of the always-until-ready cover below.) Device-confirmed.
* **Branded loading cover gates on BIND (`!bound && !slow`).** The cover + `PlayerControls` both key off `playerBound` — the proven, cross-platform "bridge found the `<video>`" signal. It's `pointerEvents="none"` (purely visual, taps pass through to a gesture-gated provider's play button), and it lifts once the bind times out (`slow`, 30s) so a stuck stream reveals the provider's OWN UI (play button / error) instead of masking it forever.
  * ⚠️ **REVERTED a first-frame gate (`playerReady`/`onReady`/`markReady`) that shipped briefly** — it held the cover + delayed `PlayerControls` until the first painted frame (`playing`/`readyState≥3` + 6s backstop) to hide the provider's poster splash on slow starts. On platforms/streams where that first-frame signal didn't latch (e.g. iOS simulator) it **masked the whole player behind "Loading" forever** — a worse regression than the overlap it fixed. Removed entirely; back to bind-gating.
  * **Still-open (was the point of the reverted change):** on a genuinely slow start the provider's own poster can flash behind our controls between bind and first paint. Needs a NON-masking fix (e.g. reliable autoplay, or a poster-hide that can't trap playback) — not the first-frame gate.
* **"Select Server" sheet opened stunted → FIXED.** `@gorhom/bottom-sheet` v5 defaults `enableDynamicSizing:true`; a `BottomSheetFlatList` reports ~0 intrinsic height, so the sheet sized to just its header+search (list clipped). Added `enableDynamicSizing={false}` (mirrors `EpisodeSheet`) → honors the `70%` snap point. Device-confirmed.
* **Error-overlay buttons unreachable post-bind → FIXED (A-BUG).** `onFatalError` now `setPlayerBound(false)` so `PlayerControls` unmounts and HijackPlayer's Retry / "Try another source" are tappable. Records failure-memory + reports telemetry once. Device re-QA confirmed end-to-end.
* **Autoplay-next toggle** added to `PlayerSettingsSheet` (TV only).
* **Alert button press-feedback (`BearAlert`):** the "Stop watching?" (and every `bearAlert`) button was a plain static `Pressable` with no feedback. Added a visible pressed state (dim `0.72` + `scale 0.965`), `android_ripple` (dark tint on the honey button, light on ghost/danger), and **expo-haptics** (Medium impact for `destructive`, selection tick otherwise). Covers the 2-button row, stacked buttons, and the cancel button. `Frost`/glow untouched (transient modal, not a playing-video surface).
* **Device re-QA confirmations (this session, MCP authorized):** telemetry lands in `provider_reports` (success / http_error / playback_stall, `script_version=videasy@…`, server-derived country); `provider_health` correct (videasy failure_rate 0.417 → correctly NOT demoted, 0.417<0.5 & 2<3). Gesture-gated "Taking too long?" banner, branded "Stop watching?" close-guard, and the full-bleed error overlay all verified live.

### Rotation + provider-chrome polish (2026-08-21)
* **Rotation mask holds until the rotation LANDS** (`PlayerScreen` `toggleFullscreen`): the old fixed 560ms timer cleared the black cover mid-spin (iOS rotate + WebView reflow outlast it), leaking the rotated frame. Now it holds opaque, listens to `Dimensions` for the orientation to swap to the target, waits one 300ms beat, then fades — with a 1600ms hard fallback so it can't strand.
* **Provider chrome hidden unconditionally + re-applied on rotation** (`HijackPlayer`): a persistent `#__npChromeKill` style hides videasy's control bar + settings drawer regardless of HTML5-fullscreen state (we never use HTML5 fullscreen — `playerRef.fullscreen()` has zero callers), re-injected on every `Dimensions` change. **CDP-verified live selectors (2026-08-21):** `mobileCenterControls` is DEAD (videasy renamed it — selector rot), the seekbar/transport bar is `div.absolute.bottom-0.h-44`, and the flashing "Player Settings/Quality/Subs/Servers" panel is the **`z-[110]`** drawer (`transition-transform` animates it through the viewport on rotation). Applied kill-style verified to hide both with the video still playing.
* **"Still syncing" banner auto-retires ~6s** after it appears, so it can't linger over a video that's actually playing in an unreachable frame.

### Search rework — FlashList + catalog filters (2026-08-22)
**Status:** COMMITTED on `feat/improvements` — `8add469` (FlashList migration, layout engine, hardened infinite scroll) + `ce06e5f` (catalog filters). `tsc` clean.
* **`SearchView` rewritten onto `@shopify/flash-list@1.7.6`** (was `FlatList`): 3-col poster grid. FlashList has no `columnWrapperStyle`, so column gaps are done with a per-column `alignItems` trick (`flex:1` cell + fixed `gridColumnWidth(3)` card, aligned flex-start/center/flex-end by `index % 3`). `PosterCard` gained `recyclingKey` + `cachePolicy:"memory-disk"` + a blurhash placeholder for clean recycling (dropped the crossfade `transition`).
* **New `useSearchData` hook = single source of truth** for search+browse: 450 ms debounced query; race-safe via a monotonic `latestCallIdRef` (stale responses dropped); pagination held in **refs** (`page`/`totalPages`/`hasMore`/`loadingMore`) so callbacks don't go stale; compound `media_type:id` dedup on append; and a **"short-list" auto-loadMore** — if a filtered first page is too short to scroll, `onEndReached` never fires, so an effect force-loads until the screen fills.
* **Catalog filters (`ce06e5f`):** search-type chips **All / Movies / TV / People** → `search/multi|movie|tv|person`; browse **provider chips** (Trending + Netflix / Prime / Apple TV+ / Disney+ / Max) via `discover` `with_watch_providers`. New components: `BrowseHeader` (trending/mood/provider rails), `GridItem`, `SearchInput`.
* **New `tmdbApi` endpoints:** `searchMovie/Tv/Person`, `discoverByProvider` (parallel tv+movie `discover`, merged + popularity-sorted), `trendingAllDay`. `MediaItem` gained `popularity`.
* **Review + fixes (2026-08-22, uncommitted at time of writing):** FIXED — (1) `watch_region` extracted to a `WATCH_REGION` constant = **`IN`** (was hardcoded `US`) to match the India-first audience; (2) TMDB error strings now surface to the UI (string-vs-`Error` fix in `fetchInitial`); (3) `loadMore` stops paginating after 3 consecutive page failures (no retry-storm); (5) FlashList `getItemType` distinguishes skeleton vs poster; (short-list auto-fill capped at 6 to stop dedup-burst paging); (6) `PosterCard` `transition` **re-added** — it had become a no-op that silently killed `TrendingShowsView`'s crossfade — plus unused styles/import removed. STILL OPEN (product decision) — (4) mood/trending chips fire literal free-text searches ("Cozy nights", "A24", "award") that return little; should hit `discover` with genre/keyword IDs.

### Earlier UI commits (2026-08-22, pre-brand) — now documented
* **`4858e19` interactive Person Details screen** (`src/screens/PersonDetailsScreen.tsx`, +`personDetails`/`personCredits` endpoints, `utils/tmdbDetails` `img`/credits helpers, nav wiring): parallax hero, collapsing glass header, expandable bio, "Known For" rail. ✅ Review fixes (2026-08-22): load-**error** now renders a back button + "Couldn't load this profile." instead of `return null` (was a blank dead-end); `knownFor` sort is null-safe on `popularity`. ✅ The stray root POC **`test_videasy_ios.js`** was moved to **`docs/investigations/videasy-ios-video-finder.js`** (the Playwright videasy-iOS `<video>`-finder — repro for the OPEN iOS-bind item).
* **`164b48c` global visual polish + `BouncyPressable`** (`src/ui/BouncyPressable.tsx`, haptics, button standardization across Details/Join/Profile/History). ✅ Review fix (2026-08-22): `BouncyPressable` now renders render-function `children` and resolves function `style` with the **live** `pressed` state (previously it rendered `{children}` directly — a function child would throw — and hardcoded `{pressed:false}`, silently dropping pressed-state styling). The pressed `useState` only engages when a function child/style is passed, so static callers stay re-render-free.
* **`8f25e3d`** FlatList infinite-scroll `onContentSizeChange` fix — **superseded** by the FlashList rework above.

### Brand identity — new logo mark + regenerated assets (2026-08-22)
**Status:** COMMITTED on `feat/improvements` (`7932d54`). `tsc` clean.
* **New mark replaces the paw:** bear ears + film-strip sprockets (left edge) + play triangle (also reads as a "B"), honey `#F0A93C` on flat charcoal `#100D0A`. **No glow** — user preference: match the reference design board, keep it clean/flat (see [[app-icon-no-glow]] in memory).
* **All icon/splash assets regenerated** from the mark: source `assets/images/{icon,splash-icon,adaptive-icon,favicon}.png` **plus** the tracked native files — iOS `AppIcon` 1024 (opaque / no-alpha, App-Store-safe) + `SplashScreenLogo` 1×/2×/3×, Android `mipmap-*/ic_launcher{,_round,_foreground}.webp` (5 densities) + `drawable-*/splashscreen_logo.png`. Splash = mark + "Bea**r**oom" wordmark (honey `r`, Outfit ExtraBold) + "Watch **together**, anywhere." tagline.
* **In-app:** new `assets/images/brandmark.png` (transparent, tight-cropped, shadowless — the play/sprocket cut-outs show the surface behind) wired into `src/ui/BrandWordmark.tsx` (→ `AppHeader`) and the onboarding welcome hero (`OnboardingView.tsx`), replacing the Ionicons `paw` glyph. Mark sized ~**1.2×** the wordmark for a balanced lockup. No `react-native-svg` in the project → the mark ships as a PNG, not a vector component.
* **Asset pipeline (reusable):** author SVG in Node (`scratchpad/gen2.js`) → headless Chromium (Playwright MCP) rasterizes SVG→canvas→PNG/WebP at exact sizes and POSTs the bytes to a local writer server (`file://` is blocked; the browser can't write the host FS). A `{alpha:false}` canvas context yields a no-alpha PNG for the iOS marketing icon; the wordmark font is embedded as a base64 `@font-face` inside the SVG.
* **NOT included:** the 3D hoodie-bear mascot from the board (needs an image model / artist — the app's procedural `BearAvatar` is untouched); a full screen-by-screen reskin (the app is already on this cozy-cinema theme).
* **Build note:** icons/splash are baked natively → need a native rebuild (`expo run:ios`/`run:android`) to show; the in-app header/onboarding mark shows on a JS reload. ⚠️ Uncommitted **landscape-orientation** edits (`AndroidManifest.xml` `portrait→unspecified`, `Info.plist` +Landscape L/R, a `project.pbxproj` prebuild reshuffle) were present in the tree from another session and were **left out** of the brand commit.

### `[x]` RESOLVED (2026-08-25) — videasy binds on iOS (was: never bound)
**Root cause (confirmed live on the iOS sim):** on iOS videasy renders its `<video>` inside a **cross-origin sub-frame**. The bridge was injected **main-frame-only**, so the finder (which walks only same-origin frames — `contentDocument` throws across origins) never reached the video, and commands (`webRef.injectJavaScript`) only ever hit the main frame → `bound` stayed false, no native controls, "still syncing" banner. Android/desktop render the `<video>` top-level, so they bound fine.
**Fix (fully app-side, no OTA redeploy) — `components/player/HijackPlayer.tsx`:**
1. `injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}` → the bridge now runs in **every** frame, so the finder binds the `<video>` from inside its own frame.
2. A **nonce-gated frame-relay** (`relayInject` + a listener appended to the injected bridge): every bridge command (`__vlCmd` play/pause/seek/quality/audio, `__vlSetGuest`, the `__vlChromeOff`/`#__npChromeKill` chrome-hide) is fanned out to all descendant frames via `postMessage`, so it reaches the frame that holds the video. The nonce blocks page/ad scripts from driving the bridge (bonus toward H3).
**Verified live (execbro, 2-device):** iOS now shows native controls + real position/duration (1:42:51 / 2:17:00) + tick heartbeat; a pause command routed through the relay paused the sub-frame video. Android still binds (Lanterns 0:11 / 56:28) — **no regression**.
### `[x]` RESOLVED (2026-08-25) — videasy resume-after-pause + command relay reach + duplicate events
Follow-up to the iOS-bind fix. Three parts (diagnosis: [docs/investigations/videasy-resume-after-pause.md](investigations/videasy-resume-after-pause.md)):
1. **Resume-after-pause (OTA bridge `videasy@9ad6a4cf`, DEPLOYED).** When videasy shows its pre-play/paused **poster card** the real `<video>` isn't mounted, so `__vlCmd('play')`→`vid.play()` couldn't lift it. Now `__vlCmd('play')` clicks videasy's OWN play button (`button[class*="bg-white/95"]`, the synthetic pointer sequence) when the card is up, handled before the no-video guard; **+ persistent finder** re-binds the `<video>` videasy recreates (drop on `vid.isConnected===false`; not `document.contains`, so a same-origin sub-iframe video isn't wrongly dropped). **Verified end-to-end on a real device.**
2. **Command relay reach (app-side `HijackPlayer.tsx`).** Commands were fanned to sub-frames via `document.querySelectorAll('iframe')`, which only sees light-DOM iframes and MISSED videasy's shadow-DOM-nested video frame (pause/seek silently no-op'd). Now fanned via **`window.frames`** — reaches frames regardless of DOM nesting; a strict superset, so used alone (a union would double-deliver + blow up exponentially via re-broadcast).
3. **Duplicate transport events (app-side `HijackPlayer.tsx`).** All-frames injection made ≥2 frames post the same event (sync engine saw everything ~2×). De-duped in `handleMessage`: signature match within 300ms for discrete events; an 850ms wall-clock rate-limit for ticks (frames sample `currentTime` a few ms apart, so exact-match misses them). Discrete-event de-dupe live-verified; tick rate-limit correct by construction.

**Remaining polish (tracked, NOT blocking):** control play/pause icon can desync from videasy's poster state; chrome-hide doesn't cover the paused-poster overlay.

---

## `[ ]` Phase 9: Server-Side Scrape Caching (Supabase)
**Status:** PENDING
**Objective:** Cache lazy fallback scrapes to protect the Cloudflare Worker from rate limits.
**Details:**
* Create a `title_provider_cache` table.
* **Rule 1:** Cache *only* metadata (dubs, qualities). NEVER cache `.m3u8` URLs for IP-locked providers.
* **Rule 2:** Do not negative-cache failures for 4h (avoids poisoning a title due to a transient API hiccup).

---

## `[ ]` Phase 10: App Store Review & Web Parity
**Status:** PENDING
**Objective:** Pass Apple/Google review and ensure Web platform degradation.
**Details:**
* **Review Mode:** Wire the Supabase `enabledProviders: []` state to show a fully benign "Listing Only" UI.
* **Web Parity:** Acknowledge cross-origin iframe limits. Provide a simplified Web-only fallback story.

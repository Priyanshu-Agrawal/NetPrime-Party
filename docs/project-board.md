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

## `[x]` Phase 6: Cloudflare-Served Injection Scripts (The Bridge)
**Status:** **CLOSED 2026-08-31** — cutover shipped and live; the last open item (broad device QA) is **superseded by Phase 11**, see below.
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
* `[x]` **Device QA (videasy):** done — the bridge binds 3/3 on a clean runtime; the
  intermittent no-bind was root-caused to a keepAlive race and fixed (`ad06d7d`, bridge
  `videasy@b4f4919a`). See `docs/qa/phase6-cutover-qa.md` and the bind-verification note.
* `[~]` **Device QA (the other 8 hijackable providers): SUPERSEDED by Phase 11.**
  *Closed deliberately, not forgotten.* Only `videasy` has ever had a `script_version`
  (verified against the live worker `/config`: 14 providers, exactly one with a script),
  so "QA the other 8" really means "author 8 more bespoke bridges and maintain them" —
  a treadmill only the operator can run, since uploading a bridge needs the operator
  secret. Phase 11 (on-device plugin resolution) reaches the same providers through a
  community-maintained plugin ecosystem instead. Revisit only if Phase 11 is abandoned.

---

## `[x]` Phase 7: Telemetry & Failure Memory (The Smart Net)
**Status:** **CLOSED 2026-08-31** — all four items shipped and live. Kept open historically
only because provider-health demotion had never actually fired (no provider was failing
enough); that is a *quiet success*, not an incomplete task. `utils/failureMemory.ts`
(MMKV, 4h TTL, `mediaKey()` → providerId) is in use by `PlayerScreen.pickInitialProvider`,
`triggerFallback` and `onFatalError`. **Phase 11 will reuse `mediaKey()` verbatim as the
queue item id** — keep the two formulas in lockstep.
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
* **Review + fixes (2026-08-22, uncommitted at time of writing):** FIXED — (1) `watch_region` extracted to a `WATCH_REGION` constant = **`IN`** (was hardcoded `US`) to match the India-first audience; (2) TMDB error strings now surface to the UI (string-vs-`Error` fix in `fetchInitial`); (3) `loadMore` stops paginating after 3 consecutive page failures (no retry-storm); (5) FlashList `getItemType` distinguishes skeleton vs poster; (short-list auto-fill capped at 6 to stop dedup-burst paging); (6) `PosterCard` `transition` **re-added** — it had become a no-op that silently killed `TrendingShowsView`'s crossfade — plus unused styles/import removed. (4) mood/trending chips fired literal free-text searches → **PARTIALLY FIXED (Discovery D3, 2026-08-28):** the **"Browse by mood" tiles** now open a discover-by-genre grid (Action 28 / Comedy 35 / Sci-Fi 878) via `openGenre` — no more `"adventure"`/`"award"` text searches. The free-text **"Trending searches"** chips ("Cozy nights", "A24") remain literal (candidate for D4 keyword IDs).

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

**Poster polish — ✅ DONE (2026-08-25):**
1. **Control icon desync** — `PlayerControls` now flips the play/pause icon **optimistically** on tap (`setPaused(p=>!p)`) instead of waiting up to ~1s for the next tick (or a videasy poster-swap that stalls events); the next real event confirms/corrects.
2. **Paused-poster shows through** — videasy's pre-play/paused card is a full-screen `div.fixed.inset-0.bg-black.cursor-pointer` overlay (Playwright-verified) with the white `bg-white/95` play button centered. `applyChrome` now adds `div[class*='inset-0'][class*='bg-black'][class*='cursor-pointer']{opacity:0}` to the post-bind chrome-hide — invisible so it no longer blacks out the paused frame above our controls, but `opacity:0` (NOT `display:none`) keeps it laid-out + clickable so the resume path (`__vlCmd('play')` → click the inner button, bubbles to this overlay) still works. Low-risk: applies only after bind; matches nothing else (the video container isn't `cursor-pointer`). _Visual on-device confirmation pending (the tall player screen exceeds the screenshot API size)._

---

### `[x]` Discovery — D2 Collections + D3 Genre browse + Home rework (2026-08-27/28)
**Status:** D2 COMMITTED (`c34d1ed` + worker `/franchises` `8309d28`); **D3 + Home rework device-verified, UNCOMMITTED**. Spec: `docs/superpowers/specs/2026-08-27-discovery-ux-overhaul-design.md` (§8 / §8.5).
* **D3 — Genre browse + Home rework (2026-08-28):** `genreList(kind)` (`genre/{movie|tv}/list`, cached 24h) + `useGenreListQuery`; **`GenreChipsRow`** = ONE row with an **animated Movie/TV toggle** (shared `components/home/KindToggle.tsx` — Reanimated sliding thumb + haptic); `openGenre` opens a discover-by-genre grid **reusing `RailSeeAll`** (no new screen — reuse/YAGNI); `BrowseHeader` moods retired to real genres. `GenreRowSection` promoted; worker Zod `FeedSection` completed (`genreRow`/`franchises`/`regionPopular`) so a served `homeFeed` round-trips. **Home arrangement reworked** — Continue → Recommended → Popular-in-region (pos 3) → Browse-by-Genre (pos 4) → content rails (genre browse must NOT be buried).
* **"Popular in {region}" rail (2026-08-28):** new `regionPopular` section → **`RegionPopularRail`** = local content (`discover?with_origin_country={CC}&vote_count.gte=50&sort_by=popularity.desc` + per-region flagship language `IN→with_original_language=hi`); fetches BOTH kinds with a **Movies/Series toggle** (same `KindToggle`) separating films vs serials. Region = CF `request.cf.country` in `/config` (`AppConfig.region`, worker LOCAL/undeployed); client `useRegion()` defaults **IN** so it runs on-device now. Global Popular rails untouched. Device-verified: Movies=DDLJ/3 Idiots, Series=Mirzapur/Family Man. `tsc`(app+worker)+lint clean.

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

---

## `[/]` Phase 11: On-Device Plugin Resolution (Program 1 · P3)
**Status:** **RESEARCH COMPLETE + VERIFIED — build not started. Gated behind Program 1 · P1.**
**Objective:** Replace the per-provider OTA-bridge treadmill with a community-maintained plugin
ecosystem that resolves `tmdbId → stream URL + headers + audio-track id` **on the device**, and play
the result in a native player instead of under the provider's own web chrome.

Full study, with every number reproducible: [`docs/research/nuvio-plugin-architecture.md`](research/nuvio-plugin-architecture.md).
Provider shortlist: [`docs/providers/plugin-provider-shortlist.md`](providers/plugin-provider-shortlist.md).

**Why this exists.** Phase 6 shipped one bridge, for one provider, updatable only by the operator.
The live worker serves **14 providers with exactly one `script_version`**. Every source that breaks is
an operator evening. This phase moves that maintenance to an ecosystem that already maintains it.

**What the research settled (all measured on real hardware, not argued):**
* `[x]` **The three walls from `scraper-poc-postmortem.md` are server-side walls.** No IP-lock (2 MB of
  media served HTTP 206 to a foreign Tor exit, no headers); no Cloudflare/JA3 block from Node **or** RN
  fetch; resolved URLs are stable and deterministically re-resolvable — only the 30s seed rotates.
* `[x]` **Plugins already run in our Hermes.** `eval`/`new Function` both work; the obfuscated 23 KB
  videasy plugin loaded in-app and returned the *same* URLs as the Node harness.
* `[x]` **The real wall is codecs.** The premium Hindi tier is MKV + HEVC + E-AC3: only **43 %** of
  streams and **12 %** of Hindi streams are AVPlayer-compatible, and the A063 test device has **no
  AC3/E-AC3 decoder at all** (`/vendor/etc/media_codecs*.xml`). iOS has the *decoders* but cannot
  demux MKV — a stream-copy remux to fMP4 plays and seeks on AVFoundation (1.5 s CPU per 120 s of 4K).
* `[x]` **`expo-libvlc-player@3.4.25` solves both platforms** — its devDeps pin `expo ~53.0.27` +
  `react-native 0.79.6`, our exact stack. Runtime-verified on the physical Android device *and* the iOS
  sim with audio-track enumeration + switching. Cost: **35 MB**, LGPL-2.1. Deferred to *Optional*.
* `[x]` **Sandbox chosen by benchmark, not preference.** Hidden WebView beats QuickJS-as-asm.js by
  **300–1600×** (plugin parse 11 ms vs 3 518 ms; 2 M-iteration loop 17 ms vs 26 974 ms). QuickJS has a
  working `setInterruptHandler` and perfect ES coverage but is disqualified on throughput.
* `[x]` **Provider audit:** 19 repos → 227 unique scrapers → 152 declaring hi/en → **111 returned
  nothing**. Lock-in set = `evyrith` + `playimdb` + `vidrock` (9/9 titles). Hindi dubs confirmed by
  `ffprobe` as real audio (`aac,2,hin`) and are **HLS/AAC**, so they play on plain `expo-video`.

**Build items (none started):**
* `[ ]` Hidden-WebView sandbox + native fetch proxy. **Hardening is not optional:** capture and
  `delete window.ReactNativeWebView` after installing the shim, add CSP `default-src 'none'`, add a
  host-side per-plugin timeout (plugins carry none — one hung a `Promise.all` indefinitely), and
  reload-on-hang since there is no CPU interrupt.
* `[ ]` Provider layer: **pin to commit SHAs, never `refs/heads/main`**; allowlist the measured set;
  blacklist `anikototv` + `animekai` (both return confidently *wrong* content — `anikototv` served a
  13-minute clip for all 5 titles tested).
* `[ ]` `cheerio/slim` (the default entry pulls `node:stream`/`undici`) + `crypto-js` (UMD verified
  working in-app). Per-plugin failure guards — `castle` throws in Hermes but works in Node.
* `[ ]` Language selection UX. **Two measured caveats:** manifest language tags are inconsistent
  (present on Endgame, absent on Jawan/Oppenheimer — trust the provider *label*, treat tags as a bonus),
  and Hindi is per-title, not guaranteed (Oppenheimer had Bengali/Tamil/Telugu but no Hindi).

**Standing risks:** obfuscated third-party JS with unrestricted network access, auto-refreshed on a
timer — a genuine supply-chain exposure, which is why pinning is mandatory. Legal/ToS posture is
unchanged by any of this. And provider liveness is volatile: `videasy`'s upstream went fully dark for
~30 minutes mid-research (DNS+TCP fine, no HTTP in 20 s) and recovered — a live demonstration of why
one provider is not an architecture.

---

## `[/]` Playback, languages & watch party — Phase 0: Foundations (2026-10-10)
**Spec:** [`superpowers/specs/2026-10-10-playback-languages-party-design.md`](superpowers/specs/2026-10-10-playback-languages-party-design.md) ·
**Plan:** [`superpowers/plans/2026-10-10-phase0-foundations.md`](superpowers/plans/2026-10-10-phase0-foundations.md)

**Why:** on 2026-10-10 the Supabase Free project had auto-paused after a month idle, and the worker turned that
into `providers: []` — byte-identical to the operator's store-review killswitch — so every app went dark.

**Done:**
* `[x]` Worker separates "Supabase answered with an empty list" (explicit `killswitch: true`) from "Supabase didn't
  answer" (`stale: true`, last-known-good from KV). **Deployed** (`25bbec54`, then hardened in `f6569238`): KV
  `CONFIG_LKG` holds the provider list *and* the bridge scripts; lane flags are read from KV `flags:v1` (dashboard
  vars would be reset by every deploy); a non-list 2xx Supabase body is treated as an outage; a reorder alone never
  costs a KV write. Deploys use the owner's wrangler OAuth login (`env -u CLOUDFLARE_API_TOKEN …`) — the shell's
  `CLOUDFLARE_API_TOKEN` has no access to this account.
* `[x]` App keeps its own last good `/config` in MMKV, boots from it, and only believes an empty list when it is an
  explicit killswitch. Remote lane flags (`embedApiLane`, `nativeLane`, `pluginHost`) land in the store, all off.
* `[x]` One neutral `PlayerHandle` v2 (`components/player/types.ts`) with capabilities, tracks and a landed-position
  seek; the web twin's duplicated types removed.
* `[x]` Test harnesses: `npm test` (jest-expo, 28 tests) and `cd worker && npm test` (vitest, 26 tests, incl.
  route-level tests of the real `/config` and `/scripts` handlers through the KV and error paths).
* `[x]` Fresh whole-phase review: no critical issues; 4 important + 3 re-graded findings fixed (each with a
  failing-first test). A killswitch first learned during an outage is now remembered on the device.
* **Deferred from the Phase 0 review (minor; pick up where noted):**
  * Phase 1 must gate lanes on *fresh* flags (or let cached flags only turn a lane off) — at boot the device copy can
    re-enable a remotely killed lane for the ~7.6 s before `/config` lands.
  * Before Phase 1's audio menu: `hijackCapabilities` says `audioTracks: true` while `HijackPlayer.getTracks()`
    returns `[]` (the WebView reports dubs through the `"audio"` event) — reconcile.
  * An outage answer keeps old providers but also drops the worker-owned `region`/`flags`/`maintenanceMode`.
  * Tidy: the accept check is written twice (slice matcher + `reduceConfig`); `source: "live"` also labels the
    worker's stale copy; one empty first frame before cache hydration (`preloadedState` would remove it).
  * Spec F1's "banner only if neither copy exists" is not built yet (`useConfigStale()` is ready for it).
  * Worker: fetch provider health in parallel with the provider list (~9 s → ~5 s worst-case cold `/config`).
* `[x]` **iOS simulator launch** — done in the Expo SDK 57 upgrade below (it needed the UIScene lifecycle, which Expo
  ships only from SDK 57.0.23; SDK ≤56 gets no fix, expo/expo#46664).

**Gate (Android emulator, 2026-10-10):**
* Live: 14 providers, `source: live`, `stale: false`, flags all off; the device copy holds 14 providers.
* Simulated outage (local worker with `SUPABASE_URL` unreachable): worker answers `stale: true, killswitch: false`;
  the cold-launched app still shows **14 providers** from its device copy (`source: cache`). Before this change it
  showed none.
* Cold start against the real worker: `/config` took **7.6 s** to land — the device copy now covers that window.
* Note: metro-mcp attaches to whichever app connected first (GoTrade on the iOS simulator here); Bearoom's runtime
  was read over Metro's CDP proxy instead (`/json/list` → `Runtime.evaluate`).

---

## `[x]` Expo SDK 53 → 57 upgrade (2026-10-10)
**Plan:** [`superpowers/plans/2026-10-10-expo-sdk57-upgrade.md`](superpowers/plans/2026-10-10-expo-sdk57-upgrade.md) ·
**Evidence:** [`research/sdk57-upgrade-impact-2026-10.md`](research/sdk57-upgrade-impact-2026-10.md)

**Why:** iOS 27 kills SDK 53 apps at launch (UIScene lifecycle required), so nothing could be tested on iOS; the
native-first playback spec also wants SDK 57's expo-video.

**Now on:** expo 57.0.27 · RN 0.86.3 · React 19.2.3 · Hermes V1 (250829098.0.17) · Reanimated 4.5 / worklets 0.10 ·
FlashList 2 · TypeScript 6 · webview 13.16.1 · CI on Node 22. Stepped 53 → 54 → 55 → 57, one commit per SDK.

**Done:**
* `[x]` `app.json` is the source of truth for the native projects (privacy manifest declared; orientation lock lives in
  JS, so iPhone players can now rotate); every SDK step regenerates `android/` + `ios/` with `prebuild --clean`.
* `[x]` Build plugins hold on every template from SDK 53 to 57 (fixture tests) and load Expo's own
  `@expo/config-plugins` copy; pods get a 16.4 deployment floor; iOS gets `enableSceneSupport`.
* `[x]` Code moved off APIs the bumps remove (`absoluteFillObject`, Reanimated layout props, `StatusBar translucent`,
  `runOnJS` → `scheduleOnRN`, FlashList `estimatedItemSize`); unused native deps removed.
* `[x]` Two pre-existing bugs found on the way, fixed with tests: search kept the old scroll offset on a new query
  (`0c1e473`); party broadcasts sent before the channel joined relied on supabase-js's deprecated REST fallback
  (`5a7ee0a`).

**Gate (2026-10-10):**
* Android emulator: Home, search grid + infinite scroll, Fight Club plays (VidCore — VidFast was down at its end),
  fullscreen rotates, audio keeps playing after Home (keep-alive patch), party room opens, chat sends, tray
  swipe-dismiss works.
* iOS 27 simulator: launches and stays up, onboarding → Home, `bearoom://movie/550` deep link, Fight Club plays,
  player rotates to landscape, party room opens.
* Both runtimes: `new Function` → 1 and indirect `eval` → 2 under Hermes V1 (the Phase 2 plugin host stays viable);
  `/config` 200 with 14 providers, `stale: false`.
* `npm test` 47/47 · worker 26/26 · `tsc` clean · lint 0 errors · `expo-doctor` 20/21 (the one notice is the expected
  "native folders + app config" message).
* iOS crash triage: 3 reports = the SDK 53 UIScene crash (fixed); 1 = a dev-launcher reload race caused by test
  automation (not reproducible in 9 tries, dev-build only).

**Deferred (minor):**
* iOS: with the keyboard open, the server sheet grows under the status bar ("Select Server" overlaps the clock).
* Dev-only: expo-dev-client's floating Tools button sits over the header room chip / player back button.
* Lint now reports 112 warnings (77 are React Compiler hints while the compiler is off).
* Android still registers an old `exp+netprime` dev-client scheme next to `exp+bearoom`.
* Embeds are flaky today (VidFast 500 / "fetching", VidLink and VidNest no media) — the native-first spec's reason.
* From the final review (minor):
  * iOS portrait before JS loads: consider `["expo-screen-orientation", { "initialOrientation": "PORTRAIT_UP" }]`;
    verify Home stays portrait when an iPhone rotates, and that the fullscreen player hides the iOS status bar.
  * `sendBroadcast` swallows errors and its REST path (`httpSend`, Realtime ≥ 2.97) is only unit-tested — add a
    `__DEV__` warning and watch one 202 on device; rename `BroadcastChannel` (shadows the DOM type).
  * Re-run the plan's "no false *Try another source* overlay in 60 s" check on VidFast once it is back up.
  * `with-fmt-xcode-fix.js`: the fmt half is dead on RN 0.86 (fmt ships inside the prebuilt deps pod) — trim it.
  * Add MainActivity fixtures for the playback plugin (its anchors are the kind SDK 55 broke in MainApplication).
  * Stale docs still name the 13.13.5 webview patch (`HANDBOOK.md`, `plans/party-background-audio.md`) and the
    deleted `devtools/execbro.ts` (`architecture/README.md`, `architecture/app-shell-and-data.md`).
* **Before the next `v*` tag (CI ships a release APK):** release build on the Nothing Phone 1 — Home while a video
  plays keeps audio (the keep-alive was last proven on an emulator debug build), and VidFast plays 60 s with no false
  overlay.

## `[~]` Phase 1A — our skin + party on existing providers (2026-10-11)
**Spec:** [`superpowers/specs/2026-10-10-playback-languages-party-design.md`](superpowers/specs/2026-10-10-playback-languages-party-design.md)
§6.2.4 + §9 row 1A · **Plan:** [`superpowers/plans/2026-10-11-phase1a-skin-existing-providers.md`](superpowers/plans/2026-10-11-phase1a-skin-existing-providers.md)
· branch `phase1a/skin-existing-providers`

**Why:** a title opened VidFast's own player ("Watch Party isn't supported on VidFast") since videasy died. Real titles
reach the native player only once plugin repos are on, so this phase puts our controls and the party on the embeds
we already have.

**Done:**
* `[x]` One generic bridge (`src/scripts/generic-bridge.ts`, OTA via `/scripts`): binds the page's best `<video>`
  (main + same-origin frames, feature over ads, rebinds on swap), paints only the video, blocks popups, keeps a play
  asked for before the stream is ready, reads subtitles from `textTracks`, auto-starts through start selectors.
* `[x]` Per-platform bindability (`capabilities.ts`: cross-origin-frame providers are iOS-only, measured overrides
  win) · party needs a provider bindable on both · solo bind-or-move-on (bind timeout, fatal error, stalled start)
  across bindable providers (`providerPick.ts`) · videasy `nextEpisode` off in parties.
* `[x]` Subtitles row in the settings sheet; Audio/Quality rows hide when the bridge can't switch them.
* `[x]` Party shows what's playing with the controls (title + S·E; portrait and fullscreen) — owner request.
* `[x]` Fixed a party bug found in the gate: a guest could take host from a live host right after joining
  (`services/party/election.ts`, `b743bff`).
* Dev switch `EXPO_PUBLIC_DEV_GENERIC_BRIDGE=1` serves the bundled bridge before it is published (dev builds only).

**Gate (2026-10-11):**
* Solo, our controls, no provider UI — Android emulator: Fight Club, GoT S1E1, Stranger Things S1E1 (VidFast);
  iOS 27 simulator: Fight Club, GoT S1E1, Stranger Things S1E1 (VidFast, bind 3.2–3.6 s, playing 6.4–9.5 s).
* Party, emulator host + iOS guest, VidFast Fight Club, 10.1 min with pause / play / +10 / −10 / scrubber seek:
  guest vs host end to end p50 0.13 s · **p95 0.34 s** · max 0.60 s (gate ≤ 1 s); no provider UI on either.
* Dead providers skipped silently (vixsrc TV, vidlink, mycineby, 111movies); F4 (`id=99999999`) ends on the branded
  error card with Retry · Try another source.
* `[x]` Phone leg (2026-10-11 06:55, phone host, emulator + iOS guests, 12 min): iOS p95 **0.45 s**; emulator p95
  1.12 s (marginal — slow post-seek catch-up on the emulated decoder). It found one more bug, fixed and republished:
  VidFast resets playback speed after a seek, so a guest couldn't catch up (bridge `677a675f` holds the speed).
* `[x]` **published 2026-10-11 06:21** — bridge `37f02567` on vidfast, vidnest, vixsrc, vidlink (priorities 1–4), videasy disabled; verified live with the dev switch off (Fight Club → VidFast, our controls, picture).

**Publish plan (after the owner says yes):** scripts for vidfast, vidnest, vixsrc, vidlink only; priority vidfast 1,
vidnest 2, vixsrc 3, vidlink 4, then plain embeds; no script for mycineby, 111movies (dead), vidcore, vidphantom
(cross-origin on Android, slow on iOS); videasy disabled (403). Revert SQL is in the ledger.

**Deferred (minor):**
* F4 card has no Report button and blames one source when all failed; dev tries every provider (~2.5 min), the
  published set (~1 min) — rework with the 1B error states.
* Unhandled `party_set_playback: not host` rejection if the host role flips mid-press (silent in release).
* Player controls have no accessibility labels.
* Exiting fullscreen on the iOS simulator stays landscape (no tilt sensor) — confirm portrait returns on a phone.
* After a host scrub a guest lands 2–3 s behind and catches up at 1.1× (~25 s on slow devices) — seek guests slightly ahead or allow a faster catch-up.

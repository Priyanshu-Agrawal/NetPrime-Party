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

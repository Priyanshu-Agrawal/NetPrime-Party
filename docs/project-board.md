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

## `[ ]` Phase 6: Cloudflare-Served Injection Scripts (The Bridge)
**Status:** PENDING
**Objective:** Decouple DOM-hijack logic from the app binary for instant cat-and-mouse updates.
**Details:**
* **Shared-Core Architecture:** Structure scripts as a shared-core (video finder, event wiring) + per-provider deltas. Keep typed references in-repo.
* **Validation:** Scripts must be linted/smoke-tested before uploading to Supabase to prevent massive blast radius.
* **Execution:** App caches scripts in MMKV on boot. `HijackPlayer.tsx` loads them instantly.

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
